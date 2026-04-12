from datetime import datetime

from pydantic import BaseModel, Field


class LiveSessionUpsert(BaseModel):
    title: str = Field(default="Live stream", max_length=160)
    description: str = Field(default="", max_length=2000)
    recording_enabled: bool = False


class ViewerTokenRequest(BaseModel):
    creator_id: int


class PremiereScheduleRequest(BaseModel):
    video_id: int
    scheduled_start_at: datetime
    title: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
