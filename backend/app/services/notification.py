from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.subscription import Subscription
from app.models.creator import Creator
from app.redis.client import redis_client


async def notify_creator(creator_id: int, message: str):
    key = f"notifications:creator:{creator_id}"
    await redis_client.lpush(key, message)


async def notify_subscribers(
    creator_id: int,
    message: str,
    db: AsyncSession,
):
    result = await db.execute(
        select(Subscription.user_id).where(
            Subscription.creator_id == creator_id
        )
    )
    user_ids = [row[0] for row in result.all()]

    for user_id in user_ids:
        key = f"notifications:user:{user_id}"
        await redis_client.lpush(key, message)
