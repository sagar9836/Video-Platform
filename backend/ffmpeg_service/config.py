# ffmpeg_service/config.py

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    kafka_bootstrap_servers: str
    s3_bucket: str
    aws_region: str
    redis_url: str

    model_config = {
        "case_sensitive": False,
        "extra": "ignore",
    }


settings = Settings()