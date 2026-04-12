import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LiveSessionStatus(str, enum.Enum):
    IDLE = "IDLE"
    STARTING = "STARTING"
    LIVE = "LIVE"
    ENDED = "ENDED"


class LiveSession(Base):
    __tablename__ = "live_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("creators.id"), index=True)
    room_name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160), default="Live stream")
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[LiveSessionStatus] = mapped_column(
        Enum(LiveSessionStatus),
        default=LiveSessionStatus.IDLE,
        index=True,
    )
    viewer_count: Mapped[int] = mapped_column(Integer, default=0)
    recording_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
