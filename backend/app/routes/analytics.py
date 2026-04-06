from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.redis.client import redis_client
from app.models.video_analytics import VideoAnalytics
from app.models.video import Video
from app.dependencies.auth import get_current_user



router = APIRouter(prefix="/analytics", tags=["Analytics"])



@router.post("/videos/{video_id}/view")
async def register_view(
    video_id: int,
    db: AsyncSession = Depends(get_db),
):
    # 1️⃣ Redis (hot counter)
    await redis_client.incr(f"video:{video_id}:views")

    # 2️⃣ DB (cold storage)
    result = await db.execute(
        select(VideoAnalytics).where(
            VideoAnalytics.video_id == video_id
        )
    )
    analytics = result.scalar_one_or_none()

    if analytics:
        analytics.views += 1
    else:
        analytics = VideoAnalytics(
            video_id=video_id,
            views=1,
        )
        db.add(analytics)

    await db.commit()
    return {"status": "ok"}

@router.post("/videos/{video_id}/watch")
async def register_watch(
    video_id: int,
    db: AsyncSession = Depends(get_db),
):
    await redis_client.incr(f"video:{video_id}:watch")

    result = await db.execute(
        select(VideoAnalytics).where(
            VideoAnalytics.video_id == video_id
        )
    )
    analytics = result.scalar_one_or_none()

    if analytics:
        analytics.watch_count += 1
    else:
        analytics = VideoAnalytics(
            video_id=video_id,
            watch_count=1,
        )
        db.add(analytics)

    await db.commit()
    return {"status": "ok"}


@router.post("/videos/{video_id}/like")
async def like_video(
    video_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = int(user["sub"])
    dedup_key = f"video:{video_id}:likes:{user_id}"

    if await redis_client.exists(dedup_key):
        return {"detail": "Already liked"}

    # Redis
    await redis_client.set(dedup_key, 1)
    await redis_client.incr(f"video:{video_id}:likes")

    # DB
    result = await db.execute(
        select(VideoAnalytics).where(
            VideoAnalytics.video_id == video_id
        )
    )
    analytics = result.scalar_one_or_none()

    if analytics:
        analytics.likes += 1
    else:
        analytics = VideoAnalytics(
            video_id=video_id,
            likes=1,
        )
        db.add(analytics)

    await db.commit()
    return {"detail": "Liked"}

@router.get("/videos/{video_id}/stats")
async def get_video_stats(
    video_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VideoAnalytics).where(
            VideoAnalytics.video_id == video_id
        )
    )
    analytics = result.scalar_one_or_none()

    if not analytics:
        return {
            "views": 0,
            "watch": 0,
            "likes": 0,
        }

    return {
        "views": analytics.views,
        "watch": analytics.watch_count,
        "likes": analytics.likes,
    }


# from fastapi import APIRouter, Depends
# from app.redis.client import redis_client
# from app.dependencies.auth import get_current_user

# router = APIRouter(prefix="/analytics", tags=["Analytics"])


# @router.post("/videos/{video_id}/view")
# async def register_view(video_id: int):
#     await redis_client.incr(f"video:{video_id}:views")
#     return {"status": "ok"}

# @router.post("/videos/{video_id}/watch")
# async def register_watch(video_id: int):
#     await redis_client.incr(f"video:{video_id}:watch")
#     return {"status": "ok"}


# @router.post("/videos/{video_id}/like")
# async def like_video(
#     video_id: int,
#     user=Depends(get_current_user),
# ):
#     dedup_key = f"video:{video_id}:likes:{user.id}"

#     if await redis_client.exists(dedup_key):
#         return {"detail": "Already liked"}

#     await redis_client.set(dedup_key, 1)
#     await redis_client.incr(f"video:{video_id}:likes")

#     return {"detail": "Liked"}


# @router.get("/videos/{video_id}/stats")
# async def get_video_stats(video_id: int):
#     views, watch, likes = await redis_client.mget(
#         f"video:{video_id}:views",
#         f"video:{video_id}:watch",
#         f"video:{video_id}:likes",
#     )

#     return {
#         "views": int(views or 0),
#         "watch": int(watch or 0),
#         "likes": int(likes or 0),
#     }




# from fastapi import APIRouter, Depends, Request, HTTPException
# from sqlalchemy.ext.asyncio import AsyncSession
# from sqlalchemy import select

# from app.db.session import get_db
# from app.dependencies.auth import get_current_user_optional

# from app.models.video_view import VideoView
# from app.models.video_watch import VideoWatch
# from app.models.video_like import VideoLike
# from app.models.video_analytics import VideoAnalytics
# from app.schemas.analytics import WatchEvent

# router = APIRouter(prefix="/analytics", tags=["Analytics"])


# # =====================
# # VIEW
# # =====================
# @router.post("/videos/{video_id}/view")
# async def register_view(
#     video_id: int,
#     request: Request,
#     db: AsyncSession = Depends(get_db),
#     user=Depends(get_current_user_optional),
# ):
#     user_id = int(user["sub"]) if user else None

#     db.add(
#         VideoView(
#             video_id=video_id,
#             user_id=user_id,
#             ip_address=request.client.host if request.client else None,
#         )
#     )

#     analytics = await db.get(VideoAnalytics, video_id)
#     if not analytics:
#         analytics = VideoAnalytics(video_id=video_id)
#         db.add(analytics)

#     analytics.views += 1

#     await db.commit()
#     return {"ok": True}


# # =====================
# # WATCH
# # =====================
# @router.post("/videos/watch")
# async def register_watch(
#     payload: WatchEvent,
#     db: AsyncSession = Depends(get_db),
#     user=Depends(get_current_user_optional),
# ):
#     user_id = int(user["sub"]) if user else None

#     db.add(
#         VideoWatch(
#             video_id=payload.video_id,
#             user_id=user_id,
#             seconds_watched=payload.seconds_watched,
#         )
#     )

#     analytics = await db.get(VideoAnalytics, payload.video_id)
#     if not analytics:
#         analytics = VideoAnalytics(video_id=payload.video_id)
#         db.add(analytics)

#     analytics.watch_time += payload.seconds_watched

#     await db.commit()
#     return {"ok": True}


# # =====================
# # LIKE (TOGGLE)
# # =====================
# @router.post("/videos/{video_id}/like")
# async def toggle_like(
#     video_id: int,
#     db: AsyncSession = Depends(get_db),
#     user=Depends(get_current_user_optional),
# ):
#     if not user:
#         raise HTTPException(401, "Authentication required")

#     user_id = int(user["sub"])

#     result = await db.execute(
#         select(VideoLike).where(
#             VideoLike.video_id == video_id,
#             VideoLike.user_id == user_id,
#         )
#     )
#     like = result.scalar_one_or_none()

#     if like:
#         await db.delete(like)
#         await db.commit()
#         return {"liked": False}

#     db.add(VideoLike(video_id=video_id, user_id=user_id))
#     await db.commit()
#     return {"liked": True}
