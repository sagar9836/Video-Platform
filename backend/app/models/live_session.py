import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LiveSessionStatus(str, enum.Enum):
    CREATED = "CREATED"
    LIVE = "LIVE"
    ENDED = "ENDED"


class LiveSession(Base):
    __tablename__ = "live_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("creators.id"), index=True)
    title: Mapped[str] = mapped_column(String(160), default="Live stream")
    description: Mapped[str] = mapped_column(String(2000), default="")
    status: Mapped[LiveSessionStatus] = mapped_column(
        Enum(LiveSessionStatus, native_enum=False),
        default=LiveSessionStatus.CREATED,
        index=True,
    )
    room_name: Mapped[str] = mapped_column(String(160), unique=True)
    recording_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
