import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.creator import Creator
from app.models.user import User, UserRole
from app.models.video import Video, VideoStatus
from app.redis.client import redis_client
from app.schemas.creator import (
    CreatorCreate,
    CreatorVerificationConfirm,
    CreatorVerificationRequest,
)
from app.services.email_service import send_email
from app.services.stream_key import generate_stream_key

router = APIRouter(prefix="/creators", tags=["Creators"])


def _decode_redis(value: str | bytes | None) -> str | None:
    if isinstance(value, bytes):
        return value.decode()
    return value


def _normalize_channel_name(value: str) -> str:
    return value.strip()


@router.post("/verify-email/request")
async def request_creator_verification(
    data: CreatorVerificationRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] != UserRole.USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only normal users can become creators",
        )

    user_id = int(user["sub"])
    channel_name = _normalize_channel_name(data.channel_name)

    existing_creator = await db.execute(select(Creator).where(Creator.user_id == user_id))
    if existing_creator.scalar_one_or_none():
        raise HTTPException(409, "Creator profile already exists")

    existing_channel = await db.execute(
        select(Creator).where(Creator.channel_name == channel_name)
    )
    if existing_channel.scalar_one_or_none():
        raise HTTPException(409, "Channel name already taken")

    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(404, "User not found")

    code = f"{secrets.randbelow(10**6):06d}"
    ttl_seconds = 10 * 60

    await redis_client.set(f"creator:verify:{user_id}:code", code, ex=ttl_seconds)
    await redis_client.set(
        f"creator:verify:{user_id}:channel_name",
        channel_name,
        ex=ttl_seconds,
    )
    await redis_client.set(
        f"creator:verify:{user_id}:description",
        data.description or "",
        ex=ttl_seconds,
    )

    await send_email(
        to_email=db_user.email,
        subject="Verify your creator channel",
        body=(
            f"Hello,\n\n"
            f"Use this verification code to create your creator channel "
            f"'{channel_name}': {code}\n\n"
            "This code expires in 10 minutes."
        ),
    )

    return {
        "detail": "Verification code sent to your email",
        "channel_name": channel_name,
    }


@router.post("/verify-email/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_creator_verification(
    data: CreatorVerificationConfirm,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] != UserRole.USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only normal users can become creators",
        )

    user_id = int(user["sub"])

    stored_code = _decode_redis(await redis_client.get(f"creator:verify:{user_id}:code"))
    if not stored_code or stored_code != data.code:
        raise HTTPException(400, "Invalid or expired verification code")

    channel_name = _decode_redis(await redis_client.get(f"creator:verify:{user_id}:channel_name"))
    description = _decode_redis(await redis_client.get(f"creator:verify:{user_id}:description"))

    if not channel_name:
        raise HTTPException(400, "Verification context expired")

    existing_channel = await db.execute(
        select(Creator).where(Creator.channel_name == channel_name)
    )
    if existing_channel.scalar_one_or_none():
        raise HTTPException(409, "Channel name already taken")

    existing_creator = await db.execute(select(Creator).where(Creator.user_id == user_id))
    if existing_creator.scalar_one_or_none():
        raise HTTPException(409, "Creator profile already exists")

    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(404, "User not found")

    stream_key = generate_stream_key(user_id)

    creator = Creator(
        user_id=user_id,
        channel_name=channel_name,
        description=description or "",
        stream_key=stream_key,
    )
    db.add(creator)
    db_user.role = UserRole.CREATOR

    await db.commit()
    await db.refresh(creator)

    access_token = create_access_token(
        {"sub": str(db_user.id), "role": db_user.role}
    )

    await redis_client.delete(f"creator:verify:{user_id}:code")
    await redis_client.delete(f"creator:verify:{user_id}:channel_name")
    await redis_client.delete(f"creator:verify:{user_id}:description")

    await send_email(
        to_email=db_user.email,
        subject="Creator account activated",
        body=(
            f"Hello,\n\n"
            f"Your creator channel '{creator.channel_name}' is now active.\n"
            f"RTMP URL: {settings.live_rtmp_url}\n"
            f"Stream key: {stream_key}\n\n"
            "You can now open the creator studio and start streaming."
        ),
    )

    return {
        "detail": "Creator account activated",
        "creator_id": creator.id,
        "channel_name": creator.channel_name,
        "rtmp_url": settings.live_rtmp_url,
        "stream_key": stream_key,
        "access_token": access_token,
    }


@router.post("/apply", status_code=status.HTTP_201_CREATED)
async def apply_for_creator(user=Depends(get_current_user)):
    if user["role"] != UserRole.USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only normal users can become creators",
        )

    return {
        "detail": (
            "Admin approval is no longer required. "
            "Use /creators/verify-email/request and /creators/verify-email/confirm"
        )
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_creator_profile(
    data: CreatorCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] != UserRole.CREATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only creators can create a profile",
        )

    user_id = int(user["sub"])

    result = await db.execute(select(Creator).where(Creator.user_id == user_id))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Creator profile already exists",
        )

    stream_key = generate_stream_key(user_id)

    creator = Creator(
        user_id=user_id,
        channel_name=data.channel_name,
        description=data.description or "",
        stream_key=stream_key,
    )

    db.add(creator)
    await db.commit()
    await db.refresh(creator)

    return creator


@router.get("/me/videos")
async def get_my_videos(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] != UserRole.CREATOR:
        raise HTTPException(403, "Only creators can access their videos")

    result = await db.execute(select(Creator).where(Creator.user_id == int(user["sub"])))
    creator = result.scalar_one_or_none()
    if not creator:
        raise HTTPException(404, "Creator profile not found")

    result = await db.execute(
        select(Video).where(Video.creator_id == creator.id).order_by(Video.id.desc())
    )
    videos = result.scalars().all()

    return [
        {
            "id": v.id,
            "title": v.title,
            "description": v.description,
            "status": v.status.value,
            "play_url": (
                f"https://{settings.cloudfront_domain}/videos/hls/{v.id}/master.m3u8"
                if v.status == VideoStatus.READY and settings.cloudfront_domain
                else None
            ),
        }
        for v in videos
    ]


@router.get("/{creator_id}/videos")
async def get_creator_videos(
    creator_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Creator).where(Creator.id == creator_id))
    creator = result.scalar_one_or_none()
    if not creator:
        raise HTTPException(404, "Creator not found")

    result = await db.execute(
        select(Video)
        .where(
            Video.creator_id == creator_id,
            Video.status == VideoStatus.READY,
        )
        .order_by(Video.id.desc())
    )
    videos = result.scalars().all()

    return [
        {
            "id": v.id,
            "title": v.title,
            "description": v.description,
            "play_url": (
                f"https://{settings.cloudfront_domain}/videos/hls/{v.id}/master.m3u8"
                if settings.cloudfront_domain
                else None
            ),
        }
        for v in videos
    ]


@router.get("/{creator_id}")
async def get_creator_channel(
    creator_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Creator).where(Creator.id == creator_id))
    creator = result.scalar_one_or_none()
    if not creator:
        raise HTTPException(404, "Creator not found")

    result = await db.execute(
        select(Video).where(
            Video.creator_id == creator_id,
            Video.status == VideoStatus.READY,
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
