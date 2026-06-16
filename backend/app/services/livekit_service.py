from datetime import timedelta
from livekit.api import AccessToken, VideoGrants

from app.core.config import settings


def create_token(identity: str, room: str, is_publisher: bool) -> str:
    token = (
        AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room,
                can_publish=is_publisher,
                can_subscribe=True,
            )
        )
        .with_ttl(timedelta(hours=1))
    )

    return token.to_jwt()


def create_egress_token() -> str:
    token = (
        AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity("egress-controller")
        .with_grants(VideoGrants(room_record=True))
        .with_ttl(timedelta(minutes=10))
    )

    return token.to_jwt()
