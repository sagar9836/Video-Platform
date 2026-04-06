from pydantic import BaseModel, Field


class WatchEvent(BaseModel):
    video_id: int
    seconds_watched: int = Field(gt=0, le=36000)
