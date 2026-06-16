from pydantic import BaseModel


class SubscriptionChannelResponse(BaseModel):
    creator_id: int
    channel_name: str
    description: str = ""
    subscribers_count: int = 0
    is_live: bool = False
    is_premiere: bool = False
    channel_url: str
    live_url: str | None = None

class SubscriptionResponse(BaseModel):
    creator_id: int
