from pydantic import BaseModel


class VideoCreateRequest(BaseModel):
    title: str
    description: str | None = ""
    visibility: str = "PUBLIC"


class VideoUploadResponse(BaseModel):
    video_id: int
    upload_url: str | None = None
    storage_backend: str = "s3"


class VideoVisibilityUpdateRequest(BaseModel):
    visibility: str
