from __future__ import annotations

from typing import Any

import boto3

from app.core.config import settings


def create_aws_client(service_name: str, **kwargs: Any):
    client_kwargs: dict[str, Any] = {
        "region_name": settings.aws_region,
        **kwargs,
    }

    if settings.aws_access_key_id:
        client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
    if settings.aws_secret_access_key:
        client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    if settings.aws_session_token:
        client_kwargs["aws_session_token"] = settings.aws_session_token

    return boto3.client(service_name, **client_kwargs)
