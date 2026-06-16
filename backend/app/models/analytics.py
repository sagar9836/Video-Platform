from datetime import datetime

from sqlalchemy import (
    ForeignKey,
    String,
    Integer,
    DateTime,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VideoView(Base):
    __tablename__ = "video_views"

    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[int] = mapped_column(
        ForeignKey("videos.id"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    ip_address: Mapped[str] = mapped_column(String(45))  # IPv6 safe
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


class VideoLike(Base):
    __tablename__ = "video_likes"

    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[int] = mapped_column(
        ForeignKey("videos.id"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


class VideoComment(Base):
    __tablename__ = "video_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[int] = mapped_column(
        ForeignKey("videos.id"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
