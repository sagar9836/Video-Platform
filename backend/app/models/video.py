from sqlalchemy import String, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.base import Base


class VideoStatus(str, enum.Enum):
    AWAITING_UPLOAD = "AWAITING_UPLOAD"
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class VideoVisibility(str, enum.Enum):
    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("creators.id"))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    s3_key: Mapped[str] = mapped_column(String, unique=True)
    thumbnail_key: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[VideoStatus] = mapped_column(
        Enum(VideoStatus, native_enum=False),
        default=VideoStatus.AWAITING_UPLOAD,
    )
    visibility: Mapped[VideoVisibility] = mapped_column(
        Enum(VideoVisibility, native_enum=False),
        default=VideoVisibility.PUBLIC,
        server_default=VideoVisibility.PUBLIC.value,
    )

    # 🔥 ADD THESE ONLY
    analytics = relationship(
        "VideoAnalytics",
        back_populates="video",
        uselist=False,
        cascade="all, delete-orphan",
    )

    comments = relationship(
        "Comment",
        back_populates="video",
        cascade="all, delete-orphan",
    )
