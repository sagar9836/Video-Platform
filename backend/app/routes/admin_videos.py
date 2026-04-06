# app/routes/admin_videos.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.dependencies.role import require_role
from app.models.video import Video, VideoStatus

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
