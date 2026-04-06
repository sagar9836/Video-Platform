import os
from pathlib import Path
from typing import Any, cast

from pydantic import BaseModel


BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_SQLITE_DB = (BACKEND_DIR / "video.db").as_posix()


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def _coerce_debug(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False

    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on", "debug", "development", "dev"}:
        return True
    if normalized in {"0", "false", "no", "off", "release", "production", "prod"}:
        return False
    return bool(value)


def _coerce_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False

    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return bool(value)


class Settings(BaseModel):
    app_name: str = "Video Streaming Platform"
    debug: bool = False

    database_url: str = f"sqlite+aiosqlite:///{DEFAULT_SQLITE_DB}"

    jwt_secret: str = "dev-secret-key"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str | None = None
    s3_bucket: str | None = None
    cloudfront_domain: str | None = None
    cloudfront_key_pair_id: str | None = None
    cloudfront_private_key_path: str | None = None

    kafka_bootstrap_servers: str = "kafka:9092"

    redis_host: str = "redis"
    redis_port: int = 6379
    redis_url: str = "redis://redis:6379/0"

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    email_from: str = "no-reply@videoplatform.local"

    live_rtmp_url: str = "rtmp://localhost:1935/stream"
    live_hls_base_url: str = "http://localhost:8081/live"

    @classmethod
    def from_env(cls) -> "Settings":
        raw_values = _read_env_file(ENV_FILE)
        raw_values.update(os.environ)

        data: dict[str, Any] = {}
        aliases = {
            "smtp_host": ("SMTP_HOST", "MAIL_SERVER"),
            "smtp_port": ("SMTP_PORT", "MAIL_PORT"),
            "smtp_username": ("SMTP_USERNAME", "MAIL_USERNAME"),
            "smtp_password": ("SMTP_PASSWORD", "MAIL_PASSWORD"),
            "smtp_use_tls": ("SMTP_USE_TLS", "MAIL_STARTTLS"),
            "email_from": ("EMAIL_FROM", "MAIL_FROM"),
        }
        model_fields = cast(dict[str, Any], getattr(cls, "model_fields", {}))
        field_names = tuple(model_fields.keys())
        if not field_names:
            legacy_fields = cast(dict[str, Any], getattr(cls, "__fields__", {}))
            field_names = tuple(legacy_fields.keys())

        for field_name in field_names:
            env_name = field_name.upper()
            if env_name in raw_values:
                data[field_name] = raw_values[env_name]
                continue

            for alias in aliases.get(field_name, ()):
                if alias in raw_values:
                    data[field_name] = raw_values[alias]
                    break

        if "debug" in data:
            data["debug"] = _coerce_debug(data["debug"])
        if "smtp_use_tls" in data:
            data["smtp_use_tls"] = _coerce_bool(data["smtp_use_tls"])

        return cls.model_validate(data)

settings = Settings.from_env()
