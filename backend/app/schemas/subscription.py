from pydantic import BaseModel

class SubscriptionResponse(BaseModel):
    creator_id: int
