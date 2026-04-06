from sqlalchemy import String, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.base import Base


class VideoStatus(str, enum.Enum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("creators.id"))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    s3_key: Mapped[str] = mapped_column(String, unique=True)

    status: Mapped[VideoStatus] = mapped_column(
        Enum(VideoStatus),
        default=VideoStatus.UPLOADED,
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
