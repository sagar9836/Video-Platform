import json
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.subscription import Subscription
from app.models.creator import Creator
from app.redis.client import redis_client


def _build_payload(
    notification_type: str,
    message: str,
    *,
    creator_id: int | None = None,
    title: str | None = None,
    channel_name: str | None = None,
    join_url: str | None = None,
    video_id: int | None = None,
) -> str:
    return json.dumps(
        {
            "type": notification_type,
            "message": message,
            "title": title,
            "creator_id": creator_id,
            "channel_name": channel_name,
            "join_url": join_url,
            "video_id": video_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )


async def notify_creator(
    creator_id: int,
    message: str,
    *,
    notification_type: str = "creator-update",
    title: str | None = None,
    channel_name: str | None = None,
    join_url: str | None = None,
    video_id: int | None = None,
):
    key = f"notifications:creator:{creator_id}"
    await redis_client.lpush(
        key,
        _build_payload(
            notification_type,
            message,
            creator_id=creator_id,
            title=title,
            channel_name=channel_name,
            join_url=join_url,
            video_id=video_id,
        ),
    )


async def notify_subscribers(
    creator_id: int,
    message: str,
    db: AsyncSession,
    *,
    notification_type: str = "channel-update",
    title: str | None = None,
    join_url: str | None = None,
    video_id: int | None = None,
):
    creator = await db.get(Creator, creator_id)
    channel_name = creator.channel_name if creator else None
    result = await db.execute(
        select(Subscription.user_id).where(
            Subscription.creator_id == creator_id
        )
    )
    user_ids = [row[0] for row in result.all()]

    for user_id in user_ids:
        key = f"notifications:user:{user_id}"
        await redis_client.lpush(
            key,
            _build_payload(
                notification_type,
                message,
                creator_id=creator_id,
                title=title,
                channel_name=channel_name,
                join_url=join_url,
                video_id=video_id,
            ),
        )
