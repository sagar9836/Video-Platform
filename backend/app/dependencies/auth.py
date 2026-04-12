from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

# 🔐 OAuth2 scheme (same as before)
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login",
    auto_error=False  # 🔥 IMPORTANT for optional auth
)


def _normalize_payload(payload: dict[str, Any]) -> dict[str, str] | None:
    sub = payload.get("sub")
    role = payload.get("role")
    if sub is None or role is None:
        return None

    role_value = getattr(role, "value", role)

    return {
        "sub": str(sub),
        "role": str(role_value),
    }


def decode_access_token(token: str) -> dict[str, str] | None:
    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError:
        return None

    return _normalize_payload(payload)


# =========================
# STRICT AUTH (Required)
# =========================
async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    db_user = await db.get(User, int(payload["sub"]))
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not db_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is blocked",
        )

    return payload


# =========================
# OPTIONAL AUTH (New)
# =========================
async def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str] | None:
    if not token:
        return None

    payload = decode_access_token(token)
    if payload is None:
        return None

    db_user = await db.get(User, int(payload["sub"]))
    if not db_user or not db_user.is_active:
        return None

    return payload
