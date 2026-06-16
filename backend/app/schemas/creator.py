from pydantic import BaseModel, Field


class CreatorCreate(BaseModel):
    channel_name: str
    description: str | None = ""


class CreatorResponse(BaseModel):
    id: int
    channel_name: str
    description: str
    subscribers_count: int

    class Config:
        from_attributes = True


class CreatorVerificationRequest(BaseModel):
    channel_name: str = Field(min_length=3, max_length=120)
    description: str | None = ""


class CreatorVerificationConfirm(BaseModel):
    code: str = Field(min_length=4, max_length=10)
