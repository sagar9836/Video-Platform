import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.creator import Creator
from app.models.user import User, UserRole
from app.redis.client import redis_client
from app.schemas.user import UserProfileResponse

router = APIRouter(prefix="/users", tags=["Users"])


def _decode_notification(raw_value):
    if isinstance(raw_value, bytes):
        raw_value = raw_value.decode()

    if isinstance(raw_value, str):
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError:
            return {
                "type": "message",
                "message": raw_value,
            }

    if isinstance(raw_value, dict):
        return raw_value

    return {
        "type": "message",
        "message": str(raw_value),
    }


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = int(user["sub"])
    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(404, "User not found")

    creator = None
    if db_user and db_user.role == UserRole.CREATOR:
        result = await db.execute(select(Creator).where(Creator.user_id == user_id))
        creator = result.scalar_one_or_none()

    return {
        "id": db_user.id,
        "email": db_user.email,
        "role": db_user.role,
        "is_email_verified": db_user.is_email_verified,
        "creator": (
            {
                "id": creator.id,
                "channel_name": creator.channel_name,
                "subscribers_count": creator.subscribers_count,
            }
            if creator
            else None
        ),
    }


@router.get("/me/notifications")
async def get_my_notifications(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notifications = await redis_client.lrange(
        f"notifications:user:{user['sub']}",
        0,
        20,
    )

    if user["role"] == UserRole.CREATOR.value:
        creator = await db.scalar(
            select(Creator).where(Creator.user_id == int(user["sub"]))
        )
        if creator:
            creator_notifications = await redis_client.lrange(
                f"notifications:creator:{creator.id}",
                0,
                20,
            )
            notifications = creator_notifications + notifications

    decoded = [_decode_notification(notification) for notification in notifications]

    return {
        "notifications": decoded,
        "count": len(decoded),
    }
