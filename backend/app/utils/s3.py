# app/utils/s3.py

import boto3
from botocore.client import Config
from app.core.config import settings

_endpoint_url = (
    f"https://s3.{settings.aws_region}.amazonaws.com"
    if settings.aws_region
    else None
)

s3_client = boto3.client(
    "s3",
    region_name=settings.aws_region,
    endpoint_url=_endpoint_url,
    config=Config(signature_version="s3v4"),
)


def generate_presigned_upload_url(bucket: str, key: str, expires_in=3600):
    """
    Generates a presigned PUT URL for uploading a video file to S3.

    IMPORTANT:
    - Do NOT enforce Content-Type here
    - Otherwise upload will silently fail if client headers differ
    """
    return s3_client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": bucket,
            "Key": key,
        },
        ExpiresIn=expires_in,
    )
# def generate_presigned_download_url(bucket: str, key: str, expires_in=300):
#     return s3_client.generate_presigned_url(
#         "get_object",
#         Params={
#             "Bucket": bucket,
#             "Key": key,
#         },
#         ExpiresIn=expires_in,
#     )

# def generate_presigned_read_url(bucket: str, key: str, expires_in=300):
#     return s3_client.generate_presigned_url(
#         "get_object",
#         Params={
#             "Bucket": bucket,
#             "Key": key,
#             "ResponseContentType": "application/vnd.apple.mpegurl",
#         },
#         ExpiresIn=expires_in,
#     )

