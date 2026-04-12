import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.dependencies.role import require_role
from app.models.creator import Creator
from app.models.creator_request import (
    CreatorRequest,
    CreatorRequestStatus,
)
from app.models.user import User, UserRole
from app.models.video import Video
from app.models.comment import Comment

router = APIRouter(prefix="/admin", tags=["Admin"])


def _slugify_channel_name(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "creator"


async def _ensure_creator_profile(db: AsyncSession, user: User) -> None:
    existing_creator = await db.scalar(
        select(Creator).where(Creator.user_id == user.id)
    )
    if existing_creator:
        return

    email_prefix = user.email.split("@", 1)[0]
    base_channel_name = _slugify_channel_name(email_prefix)
    channel_name = base_channel_name
    suffix = 2

    while await db.scalar(
        select(Creator).where(Creator.channel_name == channel_name)
    ):
        channel_name = f"{base_channel_name}-{suffix}"
        suffix += 1

    db.add(
        Creator(
            user_id=user.id,
            channel_name=channel_name,
            description="",
        )
    )


# ================================
# 1️⃣ LIST PENDING CREATOR REQUESTS
# ================================
@router.get("/creator-requests")
async def list_creator_requests(
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            CreatorRequest.user_id,
            User.email,
            CreatorRequest.status,
            CreatorRequest.created_at,
        )
        .join(User, User.id == CreatorRequest.user_id)
        .where(CreatorRequest.status == CreatorRequestStatus.PENDING)
        .order_by(CreatorRequest.created_at.desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "user_id": user_id,
            "email": email,
            "status": status.value,
            "created_at": created_at,
        }
        for user_id, email, status, created_at in rows
    ]


# ================================
# 2️⃣ APPROVE CREATOR REQUEST
# ================================
@router.post("/creator-requests/{user_id}/approve")
async def approve_creator(
    user_id: int,
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CreatorRequest).where(
            CreatorRequest.user_id == user_id,
            CreatorRequest.status == CreatorRequestStatus.PENDING,
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Pending creator request not found")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    user.role = UserRole.CREATOR
    await _ensure_creator_profile(db, user)
    req.status = CreatorRequestStatus.APPROVED

    await db.commit()
    await db.refresh(req)

    return {"detail": "User approved as CREATOR"}


# ================================
# 3️⃣ REJECT CREATOR REQUEST
# ================================
@router.post("/creator-requests/{user_id}/reject")
async def reject_creator(
    user_id: int,
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CreatorRequest).where(
            CreatorRequest.user_id == user_id,
            CreatorRequest.status == CreatorRequestStatus.PENDING,
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Pending creator request not found")

    req.status = CreatorRequestStatus.REJECTED

    await db.commit()
    await db.refresh(req)

    return {"detail": "Creator request rejected"}


# ================================
# 4️⃣ ADMIN DASHBOARD (AGGREGATES)
# ================================
@router.get("/dashboard")
async def admin_dashboard(
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    pending_requests = await db.scalar(
        select(func.count())
        .select_from(CreatorRequest)
        .where(CreatorRequest.status == CreatorRequestStatus.PENDING)
    )

    total_users = await db.scalar(
        select(func.count()).select_from(User)
    )

    total_videos = await db.scalar(
        select(func.count()).select_from(Video)
    )

    total_comments = await db.scalar(
        select(func.count()).select_from(Comment)
    )

    return {
        "pending_creator_requests": pending_requests,
        "total_users": total_users,
        "total_videos": total_videos,
        "total_comments": total_comments,
    }
