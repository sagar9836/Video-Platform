from pydantic import BaseModel


class VideoCreateRequest(BaseModel):
    title: str
    description: str | None = ""
    visibility: str = "PUBLIC"


class VideoUploadResponse(BaseModel):
    video_id: int
    upload_url: str


class VideoVisibilityUpdateRequest(BaseModel):
    visibility: str
