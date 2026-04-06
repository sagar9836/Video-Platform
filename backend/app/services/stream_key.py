import secrets


def generate_stream_key(creator_id: int) -> str:
    """
    Build a stream key tied to a creator.
    Format: creator_<id>_<random>
    """
    return f"creator_{creator_id}_{secrets.token_urlsafe(16)}"


def validate_stream_key(stream_key: str) -> int | None:
    """
    Expected format: creator_<id>_<random>
    Example: creator_12_abcd1234
    """
    try:
        prefix, creator_id, _ = stream_key.split("_", 2)
        if prefix != "creator":
            return None
        return int(creator_id)
    except Exception:
        return None