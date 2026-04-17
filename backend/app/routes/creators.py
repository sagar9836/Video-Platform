# app/routes/creator.py

import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.creator import Creator
from app.models.user import User, UserRole
from app.models.video import Video, VideoStatus, VideoVisibility
from app.redis.client import redis_client
from app.services.video_assets import (
    build_video_play_url,
    build_video_thumbnail_url,
)
from app.schemas.creator import (
    CreatorCreate,
    CreatorVerificationConfirm,
    CreatorVerificationRequest,
)
from app.services.email_service import EmailDeliveryError, send_email

logger = logging.getLogger("creator-api")

router = APIRouter(prefix="/creators", tags=["Creators"])


# ---------------- HELPERS ----------------
def _decode(value):
    if isinstance(value, bytes):
        return value.decode()
    return value


def _normalize_channel_name(value: str) -> str:
    return value.strip()


# ======================================================
# 📧 REQUEST EMAIL VERIFICATION
# ======================================================
@router.post("/verify-email/request")
async def request_creator_verification(
    data: CreatorVerificationRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] != UserRole.USER.value:
        raise HTTPException(400, "Only users can become creators")

    user_id = int(user["sub"])
    channel_name = _normalize_channel_name(data.channel_name)

    # check existing creator
    existing = await db.scalar(select(Creator).where(Creator.user_id == user_id))
    if existing:
        raise HTTPException(409, "Creator already exists")

    # check channel uniqueness
    existing_channel = await db.scalar(
        select(Creator).where(Creator.channel_name == channel_name)
    )
    if existing_channel:
        raise HTTPException(409, "Channel name taken")

    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(404, "User not found")

    code = f"{secrets.randbelow(10**6):06d}"

    await redis_client.set(f"creator:{user_id}:code", code, ex=600)
    await redis_client.set(f"creator:{user_id}:name", channel_name, ex=600)
    await redis_client.set(
        f"creator:{user_id}:desc", data.description or "", ex=600
    )

    try:
        await send_email(
            to_email=db_user.email,
            subject="Verify Creator Channel",
            body=f"Your verification code: {code}",
            raise_on_error=True,
        )
    except EmailDeliveryError:
        await redis_client.delete(f"creator:{user_id}:code")
        raise HTTPException(503, "Email failed")

    return {"message": "Verification code sent"}


# ======================================================
# ✅ CONFIRM CREATOR
# ======================================================
@router.post("/verify-email/confirm")
async def confirm_creator(
    data: CreatorVerificationConfirm,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] != UserRole.USER.value:
        raise HTTPException(400)

    user_id = int(user["sub"])

    stored_code = _decode(await redis_client.get(f"creator:{user_id}:code"))
    if not stored_code or stored_code != data.code:
        raise HTTPException(400, "Invalid code")

    channel_name = _decode(await redis_client.get(f"creator:{user_id}:name"))
    description = _decode(await redis_client.get(f"creator:{user_id}:desc"))

    if not channel_name:
        raise HTTPException(400, "Expired")

    existing_creator = await db.scalar(select(Creator).where(Creator.user_id == user_id))
    if existing_creator:
        raise HTTPException(409, "Creator already exists")

    existing_channel = await db.scalar(
        select(Creator).where(Creator.channel_name == channel_name)
    )
    if existing_channel:
        raise HTTPException(409, "Channel name taken")

    creator = Creator(
        user_id=user_id,
        channel_name=channel_name,
        description=description or "",
    )

    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(404, "User not found")
    db_user.role = UserRole.CREATOR

    db.add(creator)
    await db.commit()
    await db.refresh(creator)

    token = create_access_token(
        {"sub": str(user_id), "role": db_user.role}
    )

    await redis_client.delete(f"creator:{user_id}:code")
    await redis_client.delete(f"creator:{user_id}:name")
    await redis_client.delete(f"creator:{user_id}:desc")

    return {
        "creator_id": creator.id,
        "channel_name": creator.channel_name,
        "access_token": token,
    }


# ======================================================
# 🧑‍💻 CREATE PROFILE (OPTIONAL)
# ======================================================
@router.post("/")
async def create_creator_profile(
    data: CreatorCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] != UserRole.CREATOR.value:
        raise HTTPException(403)

    user_id = int(user["sub"])

    existing = await db.scalar(select(Creator).where(Creator.user_id == user_id))
    if existing:
        raise HTTPException(409)

    channel_name = data.channel_name.strip()
    if not channel_name:
        raise HTTPException(400, "Channel name is required")

    existing_channel = await db.scalar(
        select(Creator).where(Creator.channel_name == channel_name)
    )
    if existing_channel:
        raise HTTPException(409, "Channel name taken")

    creator = Creator(
        user_id=user_id,
        channel_name=channel_name,
        description=data.description or "",
    )

    db.add(creator)
    await db.commit()
    await db.refresh(creator)

    return creator


# ======================================================
# 🎥 MY VIDEOS
# ======================================================
@router.get("/me/videos")
async def my_videos(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] != UserRole.CREATOR.value:
        raise HTTPException(403)

    creator = await db.scalar(
        select(Creator).where(Creator.user_id == int(user["sub"]))
    )

    result = await db.execute(
        select(Video).where(Video.creator_id == creator.id).order_by(Video.id.desc())
    )

    videos = result.scalars().all()

    return [
        {
            "id": v.id,
            "title": v.title,
            "status": v.status.value,
            "play_url": build_video_play_url(v.id)
            if v.status == VideoStatus.READY
            else None,
            "thumbnail_url": build_video_thumbnail_url(v),
        }
        for v in videos
    ]


# ======================================================
# 🌍 PUBLIC CREATOR VIDEOS
# ======================================================
@router.get("/{creator_id}/videos")
async def creator_videos(
    creator_id: int,
    db: AsyncSession = Depends(get_db),
):
    creator = await db.get(Creator, creator_id)
    if not creator:
        raise HTTPException(404)

    result = await db.execute(
        select(Video).where(
            Video.creator_id == creator_id,
            Video.status == VideoStatus.READY,
            Video.visibility == VideoVisibility.PUBLIC,
        )
    )

    videos = result.scalars().all()

    return [
        {
            "id": v.id,
            "title": v.title,
            "play_url": build_video_play_url(v.id),
            "thumbnail_url": build_video_thumbnail_url(v),
        }
        for v in videos
    ]


# ======================================================
# 📺 CREATOR CHANNEL
# ======================================================
@router.get("/{creator_id}")
async def creator_channel(
    creator_id: int,
    db: AsyncSession = Depends(get_db),
):
    creator = await db.get(Creator, creator_id)
    if not creator:
        raise HTTPException(404)

    result = await db.execute(
        select(Video).where(
            Video.creator_id == creator_id,
            Video.status == VideoStatus.READY,
            Video.visibility == VideoVisibility.PUBLIC,
        )
    )

    videos_count = len(result.scalars().all())

    return {
        "id": creator.id,
        "channel_name": creator.channel_name,
        "description": creator.description,
        "subscribers_count": creator.subscribers_count,
        "videos_count": videos_count,
    }
