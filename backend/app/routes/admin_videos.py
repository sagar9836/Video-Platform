# app/routes/admin_videos.py
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.dependencies.role import require_role
from app.models.video import Video, VideoStatus
from app.redis.client import redis_client
from app.services.video_assets import build_video_thumbnail_url, delete_video_assets

router = APIRouter(prefix="/admin/videos", tags=["Admin Videos"])


@router.get("")
async def list_videos(
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Video).order_by(Video.id.desc()))
    videos = result.scalars().all()

    return [
        {
            "id": v.id,
            "title": v.title,
            "status": v.status.value,
            "creator_id": v.creator_id,
            "visibility": v.visibility.value,
            "thumbnail_url": build_video_thumbnail_url(v),
        }
        for v in videos
    ]


@router.post("/{video_id}/disable")
async def disable_video(
    video_id: int,
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    video.status = VideoStatus.FAILED
    await db.commit()

    return {"detail": "Video disabled"}


@router.delete("/{video_id}")
async def delete_video(
    video_id: int,
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    await asyncio.to_thread(delete_video_assets, video)
    await redis_client.delete(
        f"video:{video.id}:status",
        f"video:{video.id}:error",
    )
    await db.delete(video)
    await db.commit()

    return {"detail": "Video deleted"}
