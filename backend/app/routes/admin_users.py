# app/routes/admin_users.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.dependencies.role import require_role
from app.models.user import User

router = APIRouter(prefix="/admin/users", tags=["Admin Users"])


@router.get("/")
async def list_users(
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.id.desc()))
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "email": u.email,
            "role": u.role.value,
            "is_active": u.is_active,
        }
        for u in users
    ]


@router.post("/{user_id}/toggle-active")
async def toggle_user_status(
    user_id: int,
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    user.is_active = not user.is_active
    await db.commit()

    return {
        "id": user.id,
        "is_active": user.is_active,
    }
