import time
from livekit import AccessToken, VideoGrant
from app.core.config import settings


def create_token(identity: str, room: str, is_publisher: bool):
    token = AccessToken(
        settings.livekit_api_key,
        settings.livekit_api_secret,
        identity=identity,
    )

    grant = VideoGrant(
        room_join=True,
        room=room,
        can_publish=is_publisher,
        can_subscribe=True,
    )

    token.add_grant(grant)
    token.ttl = 3600  # 1 hour

    return token.to_jwt()