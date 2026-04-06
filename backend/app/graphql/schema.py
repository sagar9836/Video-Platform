from __future__ import annotations

from typing import Optional, cast

import boto3
import strawberry
from botocore.exceptions import ClientError
from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.types import Info

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.dependencies.auth import decode_access_token
from app.models.analytics import VideoLike
from app.models.comment import Comment
from app.models.creator import Creator
from app.models.creator_request import CreatorRequest, CreatorRequestStatus
from app.models.subscription import Subscription
from app.models.user import User, UserRole
from app.models.video import Video, VideoStatus
from app.models.video_analytics import VideoAnalytics
from app.redis.client import redis_client


def _get_s3_client():
    return boto3.client("s3", region_name=settings.aws_region)


def _optional_user_from_request(request: Request) -> dict | None:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None

    try:
        scheme, token = auth_header.split(" ", 1)
    except ValueError:
        return None

    if scheme.lower() != "bearer" or not token:
        return None

    return decode_access_token(token)


async def _subscription_state(
    db: AsyncSession,
    user_id: int | None,
    creator_id: int,
) -> bool:
    if not user_id:
        return False

    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.creator_id == creator_id,
        )
    )
    return result.scalar_one_or_none() is not None


@strawberry.type
class CreatorSummary:
    id: int
    channel_name: str
    description: str
    subscribers_count: int
    videos_count: int


@strawberry.type
class VideoCard:
    id: int
    title: str
    description: str
    creator_id: int
    status: str
    play_url: Optional[str] = None


@strawberry.type
class VideoStats:
    views: int
    watch_count: int
    likes: int
    liked: bool


@strawberry.type
class VideoPlayback:
    hls_url: Optional[str]
    guest_mode: bool
    allowed_fraction: float
    message: Optional[str]


@strawberry.type
class ChannelPageData:
    channel: CreatorSummary
    videos: list[VideoCard]
    is_live: bool
    is_subscribed: bool


@strawberry.type
class VideoPageData:
    id: int
    title: str
    description: str
    creator: Optional[CreatorSummary]
    stats: VideoStats
    is_subscribed: bool
    playback: Optional[VideoPlayback]


@strawberry.type
class CreatorStudioData:
    creator: CreatorSummary
    videos: list[VideoCard]
    is_live: bool


@strawberry.type
class AdminDashboardData:
    pending_creator_requests: int
    total_users: int
    total_videos: int
    total_comments: int


def _creator_summary(creator: Creator, videos_count: int) -> CreatorSummary:
    return CreatorSummary(
        id=creator.id,
        channel_name=creator.channel_name,
        description=creator.description,
        subscribers_count=creator.subscribers_count,
        videos_count=videos_count,
    )


def _video_card(video: Video) -> VideoCard:
    play_url = None
    if video.status == VideoStatus.READY and settings.cloudfront_domain:
        play_url = f"https://{settings.cloudfront_domain}/videos/hls/{video.id}/master.m3u8"

    return VideoCard(
        id=video.id,
        title=video.title,
        description=video.description,
        creator_id=video.creator_id,
        status=video.status.value,
        play_url=play_url,
    )


@strawberry.type
class Query:
    @strawberry.field
    async def dashboard_feed(self) -> list[VideoCard]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Video)
                .where(Video.status == VideoStatus.READY)
                .order_by(Video.id.desc())
            )
            videos = result.scalars().all()
            return [_video_card(video) for video in videos]

    @strawberry.field
    async def channel_page(self, info: Info, creator_id: int) -> ChannelPageData:
        request: Request = info.context["request"]
        viewer = _optional_user_from_request(request)
        viewer_id = int(viewer["sub"]) if viewer else None

        async with AsyncSessionLocal() as db:
            creator = await db.get(Creator, creator_id)
            if not creator:
                raise HTTPException(404, "Creator not found")

            videos_result = await db.execute(
                select(Video)
                .where(
                    Video.creator_id == creator_id,
                    Video.status == VideoStatus.READY,
                )
                .order_by(Video.id.desc())
            )
            videos = videos_result.scalars().all()

            live_state = await redis_client.get(f"live:{creator_id}:status")
            is_subscribed = await _subscription_state(db, viewer_id, creator_id)

            return ChannelPageData(
                channel=_creator_summary(creator, len(videos)),
                videos=[_video_card(video) for video in videos],
                is_live=live_state == "LIVE",
                is_subscribed=is_subscribed,
            )

    @strawberry.field
    async def video_page(self, info: Info, video_id: int) -> VideoPageData:
        request: Request = info.context["request"]
        viewer = _optional_user_from_request(request)
        viewer_id = int(viewer["sub"]) if viewer else None

        async with AsyncSessionLocal() as db:
            video = await db.get(Video, video_id)
            if not video or video.status != VideoStatus.READY:
                raise HTTPException(404, "Video not found")

            creator = await db.get(Creator, video.creator_id)
            videos_count_result = await db.execute(
                select(func.count(Video.id))
                .where(
                    Video.creator_id == video.creator_id,
                    Video.status == VideoStatus.READY,
                )
            )
            videos_count = cast(int, videos_count_result.scalar_one())

            analytics = await db.get(VideoAnalytics, video_id)
            like_result = None
            if viewer_id:
                like_result = await db.execute(
                    select(VideoLike).where(
                        VideoLike.video_id == video_id,
                        VideoLike.user_id == viewer_id,
                    )
                )

            is_subscribed = False
            if creator:
                is_subscribed = await _subscription_state(db, viewer_id, creator.id)

            playback = None
            hls_path = f"videos/hls/{video.id}/master.m3u8"
            if settings.s3_bucket and settings.cloudfront_domain:
                try:
                    _get_s3_client().head_object(
                        Bucket=settings.s3_bucket,
                        Key=hls_path,
                    )
                    playback = VideoPlayback(
                        hls_url=f"https://{settings.cloudfront_domain}/{hls_path}",
                        guest_mode=viewer is None,
                        allowed_fraction=0.25,
                        message=(
                            "Please login or signup to continue watching after preview"
                            if viewer is None
                            else None
                        ),
                    )
                except ClientError:
                    playback = None

            return VideoPageData(
                id=video.id,
                title=video.title,
                description=video.description,
                creator=_creator_summary(creator, videos_count) if creator else None,
                stats=VideoStats(
                    views=analytics.views if analytics else 0,
                    watch_count=analytics.watch_count if analytics else 0,
                    likes=analytics.likes if analytics else 0,
                    liked=like_result.scalar_one_or_none() is not None if like_result else False,
                ),
                is_subscribed=is_subscribed,
                playback=playback,
            )

    @strawberry.field
    async def creator_studio(self, info: Info) -> Optional[CreatorStudioData]:
        request: Request = info.context["request"]
        viewer = _optional_user_from_request(request)
        if not viewer or viewer.get("role") != UserRole.CREATOR:
            return None

        user_id = int(viewer["sub"])

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Creator).where(Creator.user_id == user_id))
            creator = result.scalar_one_or_none()
            if not creator:
                return None

            videos_result = await db.execute(
                select(Video).where(Video.creator_id == creator.id).order_by(Video.id.desc())
            )
            videos = videos_result.scalars().all()
            live_state = await redis_client.get(f"live:{creator.id}:status")

            return CreatorStudioData(
                creator=_creator_summary(creator, len(videos)),
                videos=[_video_card(video) for video in videos],
                is_live=live_state == "LIVE",
            )

    @strawberry.field
    async def admin_dashboard(self, info: Info) -> AdminDashboardData:
        request: Request = info.context["request"]
        viewer = _optional_user_from_request(request)
        if not viewer or viewer.get("role") != UserRole.ADMIN:
            raise HTTPException(403, "Admin access required")

        async with AsyncSessionLocal() as db:
            pending_requests = cast(
                int,
                (
                    await db.scalar(
                        select(func.count(cast(object, CreatorRequest.id)))
                        .where(CreatorRequest.status == CreatorRequestStatus.PENDING)
                    )
                )
                or 0,
            )
            total_users = cast(
                int,
                (await db.scalar(select(func.count(cast(object, User.id))))) or 0,
            )
            total_videos = cast(
                int,
                (await db.scalar(select(func.count(cast(object, Video.id))))) or 0,
            )
            total_comments = cast(
                int,
                (await db.scalar(select(func.count(cast(object, Comment.id))))) or 0,
            )

            return AdminDashboardData(
                pending_creator_requests=pending_requests,
                total_users=total_users,
                total_videos=total_videos,
                total_comments=total_comments,
            )


schema = strawberry.Schema(query=Query)
