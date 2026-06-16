import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.redis.client import redis_client
from app.schemas.auth import (
    EmailVerificationConfirmRequest,
    EmailVerificationRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterResponse,
    RegisterRequest,
    ResetPasswordConfirmRequest,
    TokenResponse,
)
from app.services.email_service import EmailDeliveryError, send_email

router = APIRouter(prefix="/auth", tags=["Auth"])


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _decode_cache_value(value):
    if isinstance(value, bytes):
        return value.decode()
    return value


def _verification_code_key(email: str) -> str:
    return f"auth:email-verify:{email}:code"


def _verification_sent_key(email: str) -> str:
    return f"auth:email-verify:{email}:sent"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _issue_verification_code(email: str) -> str:
    code = f"{secrets.randbelow(10**6):06d}"
    await redis_client.set(_verification_code_key(email), code, ex=10 * 60)
    await redis_client.set(_verification_sent_key(email), "1", ex=10 * 60)
    return code


async def _send_verification_email(email: str, code: str) -> None:
    sent = await send_email(
        to_email=email,
        subject="Verify your VideoPlatform account",
        body=(
            "Welcome to VideoPlatform.\n\n"
            f"Use this verification code to activate your account: {code}\n\n"
            "This code expires in 10 minutes."
        ),
        raise_on_error=True,
    )
    if not sent:
        return


@router.post("/register", response_model=RegisterResponse)
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

    code = await _issue_verification_code(user.email)
    try:
        await _send_verification_email(user.email, code)
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=503, detail="Unable to send verification email") from exc

    return {
        "detail": "Account created. Enter the verification code sent to your email.",
        "email": user.email,
        "requires_verification": True,
    }


@router.post("/verify-email/request")
async def request_email_verification(
    data: EmailVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    email = _normalize_email(data.email)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        return {"detail": "If the account exists, a verification code has been sent"}

    if user.is_email_verified:
        return {"detail": "Email is already verified"}

    code = await _issue_verification_code(email)

    try:
        await _send_verification_email(email, code)
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=503, detail="Unable to send verification email") from exc

    return {"detail": "Verification code sent"}


@router.post("/verify-email/confirm", response_model=TokenResponse)
async def confirm_email_verification(
    data: EmailVerificationConfirmRequest,
    db: AsyncSession = Depends(get_db),
):
    email = _normalize_email(data.email)
    cached_code = _decode_cache_value(await redis_client.get(_verification_code_key(email)))

    if not cached_code or cached_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_email_verified = True
    user.email_verified_at = _utcnow()
    await db.commit()

    await redis_client.delete(_verification_code_key(email))
    await redis_client.delete(_verification_sent_key(email))

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
    if not user.is_email_verified:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please verify your email before logging in.",
        )

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
    cached_code = _decode_cache_value(await redis_client.get(f"auth:pwd-reset:{email}"))

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
