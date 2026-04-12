import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.redis.client import redis_client
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordConfirmRequest,
    TokenResponse,
)
from app.services.email_service import send_email

router = APIRouter(prefix="/auth", tags=["Auth"])


def _normalize_email(email: str) -> str:
    return email.strip().lower()


@router.post("/register", response_model=TokenResponse)
async def register(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    email = _normalize_email(data.email)

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        hashed_password=hash_password(data.password),
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    await send_email(
        to_email=user.email,
        subject="Welcome to VideoPlatform",
        body=(
            f"Hello,\n\n"
            f"Welcome to VideoPlatform.\n"
            f"Your account has been created successfully with {user.email}.\n\n"
            f"You can now watch videos, subscribe to creators, and explore the platform."
        ),
    )

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token}


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    email = _normalize_email(data.email)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is blocked")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token}


@router.post("/forgot-password/request")
async def forgot_password_request(
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    email = _normalize_email(data.email)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        return {"detail": "If the account exists, a password reset code has been sent"}

    code = f"{secrets.randbelow(10**6):06d}"
    await redis_client.set(f"auth:pwd-reset:{email}", code, ex=10 * 60)

    await send_email(
        to_email=email,
        subject="Your password reset code",
        body=f"Use this code to reset your password: {code}",
    )

    return {"detail": "If the account exists, a password reset code has been sent"}


@router.post("/forgot-password/confirm")
async def forgot_password_confirm(
    data: ResetPasswordConfirmRequest,
    db: AsyncSession = Depends(get_db),
):
    email = _normalize_email(data.email)
    cached_code = await redis_client.get(f"auth:pwd-reset:{email}")

    if not cached_code or cached_code != data.code:
        raise HTTPException(400, "Invalid or expired reset code")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    user.hashed_password = hash_password(data.new_password)
    await db.commit()

    await redis_client.delete(f"auth:pwd-reset:{email}")
    return {"detail": "Password reset successful"}
