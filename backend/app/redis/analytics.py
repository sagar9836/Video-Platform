# app/redis/analytics.py
from app.redis.client import redis_client

VIEW_TTL = 60 * 60 * 24  # 24 hours


def view_key(video_id: int) -> str:
    return f"analytics:video:{video_id}:views"


def watch_time_key(video_id: int) -> str:
    return f"analytics:video:{video_id}:watch_time"


async def incr_view(video_id: int):
    key = view_key(video_id)
    await redis_client.incr(key)
    await redis_client.expire(key, VIEW_TTL)  # 🔥 auto cleanup


async def add_watch_time(video_id: int, seconds: int):
    key = watch_time_key(video_id)
    await redis_client.incrby(key, seconds)
    await redis_client.expire(key, VIEW_TTL)



# from app.redis.client import redis_client

# def video_views_key(video_id: int):
#     return f"video:{video_id}:views"

# def video_watch_time_key(video_id: int):
#     return f"video:{video_id}:watch_time"


# async def incr_view(video_id: int):
#     await redis_client.incr(video_views_key(video_id))


# async def add_watch_time(video_id: int, seconds: int):
#     await redis_client.incrby(video_watch_time_key(video_id), seconds)
