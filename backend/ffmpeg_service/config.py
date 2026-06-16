# ffmpeg_service/config.py

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    kafka_bootstrap_servers: str
    kafka_max_poll_interval_ms: int = 3600000
    kafka_session_timeout_ms: int = 45000
    kafka_heartbeat_interval_ms: int = 15000
    storage_backend: str = "local"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_session_token: str | None = None
    s3_bucket: str | None = None
    aws_region: str | None = None
    redis_url: str
    local_media_root: str = "/worker/media"

    model_config = {
        "case_sensitive": False,
        "extra": "ignore",
    }


settings = Settings()
