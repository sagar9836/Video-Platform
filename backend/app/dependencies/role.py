from fastapi import Depends, HTTPException, status
from app.dependencies.auth import get_current_user
from app.models.user import UserRole


def require_role(required_role: str | UserRole):
    normalized_role = (
        required_role.value
        if isinstance(required_role, UserRole)
        else str(required_role)
    )

    def role_checker(user: dict[str, str] = Depends(get_current_user)):
        if user.get("role") != normalized_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return role_checker
