import enum
from sqlalchemy import Column, Integer, Enum
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class VideoStatus(str, enum.Enum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True)
    creator_id = Column(Integer, nullable=True)
    status = Column(Enum(VideoStatus), nullable=False)
