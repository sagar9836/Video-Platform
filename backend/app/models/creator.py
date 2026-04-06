from sqlalchemy import String, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Creator(Base):
    __tablename__ = "creators"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True
    )

    channel_name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[str] = mapped_column(String, default="")
    subscribers_count: Mapped[int] = mapped_column(Integer, default=0)
    stream_key: Mapped[str] = mapped_column(
        String,
        unique=True,
        index=True,
        nullable=True
    )