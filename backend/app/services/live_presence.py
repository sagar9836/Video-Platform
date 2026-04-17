import redis.asyncio as redis
from app.core.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)


def key(room_name: str):
    return f"live:viewers:{room_name}"


async def increment(room_name: str):
    return await redis_client.incr(key(room_name))


async def decrement(room_name: str):
    count = await redis_client.decr(key(room_name))
    if count < 0:
        await redis_client.set(key(room_name), 0)
        return 0
    return count


async def get_count(room_name: str):
    value = await redis_client.get(key(room_name))
    return int(value or 0)