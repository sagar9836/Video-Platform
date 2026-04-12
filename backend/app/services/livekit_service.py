from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings


def build_room_name(creator_id: int) -> str:
    return f"creator-{creator_id}"


def build_participant_identity(prefix: str, identifier: str | int) -> str:
    return f"{prefix}-{identifier}"


def create_livekit_token(
    *,
    identity: str,
    room_name: str,
    can_publish: bool,
    can_subscribe: bool,
    can_publish_data: bool = True,
    display_name: str | None = None,
    metadata: str | None = None,
    room_admin: bool = False,
    ttl_minutes: int = 60,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.livekit_api_key,
        "sub": identity,
        "nbf": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
        "video": {
            "room": room_name,
            "roomJoin": True,
            "canPublish": can_publish,
            "canSubscribe": can_subscribe,
            "canPublishData": can_publish_data,
            "roomAdmin": room_admin,
        },
    }

    if display_name:
        payload["name"] = display_name
    if metadata:
        payload["metadata"] = metadata

    return jwt.encode(
        payload,
        settings.livekit_api_secret,
        algorithm="HS256",
        headers={"typ": "JWT"},
    )
