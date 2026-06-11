from __future__ import annotations

from typing import Optional, cast

import strawberry
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
from app.models.live_session import LiveSession, LiveSessionStatus
from app.models.premiere_session import PremiereSession, PremiereSessionStatus
from app.models.subscription import Subscription
from app.models.user import User, UserRole
from app.models.video import Video, VideoStatus, VideoVisibility
from app.models.video_analytics import VideoAnalytics
from app.services.storage import (
    build_local_asset_url,
    build_public_asset_url,
    is_hybrid_storage,
    local_asset_exists,
    uses_local_storage,
    uses_s3_storage,
)
from app.services.video_assets import build_video_play_url, build_video_thumbnail_url
from app.utils.aws import create_aws_client


def _get_s3_client():
    return create_aws_client("s3")


def _utcnow():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)


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


def _is_local_request(request: Request) -> bool:
    forwarded_host = request.headers.get("host", "")
    hostname = forwarded_host.split(":", 1)[0].lower()
    return hostname in {"localhost", "127.0.0.1"}


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


async def _creator_for_user_id(
    db: AsyncSession,
    user_id: int | None,
) -> Creator | None:
    if not user_id:
        return None

    result = await db.execute(select(Creator).where(Creator.user_id == user_id))
    return result.scalar_one_or_none()


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
    visibility: str
    play_url: Optional[str] = None
    thumbnail_url: Optional[str] = None


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
    play_url = build_video_play_url(video.id) if video.status == VideoStatus.READY else None

    return VideoCard(
        id=video.id,
        title=video.title,
        description=video.description,
        creator_id=video.creator_id,
        status=video.status.value,
        visibility=video.visibility.value,
        play_url=play_url,
        thumbnail_url=build_video_thumbnail_url(video),
    )


def _premiere_is_live(premiere: PremiereSession | None) -> bool:
    if not premiere:
        return False

    if premiere.status == PremiereSessionStatus.LIVE:
        return True

    return (
        premiere.status == PremiereSessionStatus.SCHEDULED
        and premiere.scheduled_start_at <= _utcnow()
    )


@strawberry.type
class Query:
    @strawberry.field
    async def dashboard_feed(self) -> list[VideoCard]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Video)
                .where(
                    Video.status == VideoStatus.READY,
                    Video.visibility == VideoVisibility.PUBLIC,
                )
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
                    Video.visibility == VideoVisibility.PUBLIC,
                )
                .order_by(Video.id.desc())
            )
            videos = videos_result.scalars().all()

            is_subscribed = await _subscription_state(db, viewer_id, creator_id)
            live_session = await db.scalar(
                select(LiveSession)
                .where(LiveSession.creator_id == creator_id)
                .order_by(LiveSession.id.desc())
                .limit(1)
            )
            premiere_session = await db.scalar(
                select(PremiereSession)
                .where(
                    PremiereSession.creator_id == creator_id,
                    PremiereSession.status.in_(
                        [PremiereSessionStatus.SCHEDULED, PremiereSessionStatus.LIVE]
                    ),
                )
                .order_by(PremiereSession.scheduled_start_at.desc(), PremiereSession.id.desc())
                .limit(1)
            )

            return ChannelPageData(
                channel=_creator_summary(creator, len(videos)),
                videos=[_video_card(video) for video in videos],
                is_live=bool(
                    (live_session and live_session.status == LiveSessionStatus.LIVE)
                    or _premiere_is_live(premiere_session)
                ),
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

            viewer_creator = await _creator_for_user_id(db, viewer_id)
            can_view_private_video = bool(
                viewer_creator and viewer_creator.id == video.creator_id
            )
            if video.visibility == VideoVisibility.PRIVATE and not can_view_private_video:
                raise HTTPException(404, "Video not found")

            creator = await db.get(Creator, video.creator_id)
            videos_count_result = await db.execute(
                select(func.count(Video.id))
                .where(
                    Video.creator_id == video.creator_id,
                    Video.status == VideoStatus.READY,
                    Video.visibility == VideoVisibility.PUBLIC,
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
            asset_available = False
            playback_url = None
            prefer_local = is_hybrid_storage() and _is_local_request(request)

            if prefer_local and uses_local_storage():
                asset_available = local_asset_exists(hls_path)
                if asset_available:
                    playback_url = build_local_asset_url(hls_path)

            if not asset_available and uses_s3_storage() and settings.s3_bucket:
                try:
                    _get_s3_client().head_object(
                        Bucket=settings.s3_bucket,
                        Key=hls_path,
                    )
                    asset_available = True
                    playback_url = build_public_asset_url(hls_path)
                except Exception:
                    asset_available = False

            if not asset_available and uses_local_storage():
                asset_available = local_asset_exists(hls_path)
                if asset_available:
                    playback_url = build_local_asset_url(hls_path)

            if asset_available and playback_url:
                playback = VideoPlayback(
                    hls_url=playback_url,
                    guest_mode=viewer is None,
                    allowed_fraction=0.25,
                    message=(
                        "Please login or signup to continue watching after preview"
                        if viewer is None
                        else None
                    ),
                )

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
        if not viewer or viewer.get("role") != UserRole.CREATOR.value:
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
            live_session = await db.scalar(
                select(LiveSession)
                .where(LiveSession.creator_id == creator.id)
                .order_by(LiveSession.id.desc())
                .limit(1)
            )
            premiere_session = await db.scalar(
                select(PremiereSession)
                .where(
                    PremiereSession.creator_id == creator.id,
                    PremiereSession.status.in_(
                        [PremiereSessionStatus.SCHEDULED, PremiereSessionStatus.LIVE]
                    ),
                )
                .order_by(PremiereSession.scheduled_start_at.desc(), PremiereSession.id.desc())
                .limit(1)
            )

            return CreatorStudioData(
                creator=_creator_summary(creator, len(videos)),
                videos=[_video_card(video) for video in videos],
                is_live=bool(
                    (live_session and live_session.status == LiveSessionStatus.LIVE)
                    or _premiere_is_live(premiere_session)
                ),
            )

    @strawberry.field
    async def admin_dashboard(self, info: Info) -> AdminDashboardData:
        request: Request = info.context["request"]
        viewer = _optional_user_from_request(request)
        if not viewer or viewer.get("role") != UserRole.ADMIN.value:
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
