from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base


class LiveSession(Base):
    __tablename__ = "live_sessions"

    id = Column(Integer, primary_key=True, index=True)

    creator_id = Column(Integer, ForeignKey("creators.id"), nullable=False)

    title = Column(String, nullable=True)

    status = Column(
        String,
        default="CREATED",  # CREATED | LIVE | ENDED
        nullable=False,
    )

    room_name = Column(String, unique=True, nullable=False)

    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())