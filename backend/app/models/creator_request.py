import enum
from datetime import datetime

from sqlalchemy import (
    ForeignKey,
    String,
    DateTime,
    Enum,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# 🔹 Enum for request status (SAFE)
class CreatorRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class CreatorRequest(Base):
    __tablename__ = "creator_requests"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 🔗 Link to user
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )

    # 🔄 Request status
    status: Mapped[CreatorRequestStatus] = mapped_column(
        Enum(CreatorRequestStatus),
        default=CreatorRequestStatus.PENDING,
        index=True,
        nullable=False,
    )

    # ⏱️ When request was created
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )

    # 🔁 Optional relationship (VERY useful for admin)
    user = relationship("User", backref="creator_request")


# 🔥 Helpful composite index for admin queries
Index(
    "ix_creator_requests_status_created_at",
    CreatorRequest.status,
    CreatorRequest.created_at,
)
