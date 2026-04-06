from pydantic import BaseModel, EmailStr
from app.models.user import UserRole
from typing import Optional

# Input Schema
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password:str
    role : UserRole


# Response Schema
class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role : UserRole

    class Config:
        from_attributes = True


class SubscriberResponse(BaseModel):
    id: int
    name: str
    
    class Config:
        from_attributes = True

class CreatorInfo(BaseModel):
    id: int
    channel_name: str
    subscribers_count: int


class UserProfileResponse(BaseModel):
    id: int
    email: str
    role: str
    creator: Optional[CreatorInfo] = None