import boto3
import os
from config import settings

s3 = boto3.client(
    "s3",
    region_name=settings.aws_region,
)


def download_from_s3(s3_key: str, local_path: str):
    """
    Download original MP4 from S3
    """
    s3.download_file(
        settings.s3_bucket,
        s3_key,
        local_path,
    )


def upload_hls_to_s3(video_id: int, hls_dir: str):
    """
    Upload HLS output (.m3u8 + .ts) to S3
    with correct MIME types & caching
    """

    prefix = f"videos/hls/{video_id}"

    for root, _, files in os.walk(hls_dir):
        for file in files:
            full_path = os.path.join(root, file)
            s3_key = f"{prefix}/{file}"

            # 🎯 Correct content types
            if file.endswith(".m3u8"):
                content_type = "application/vnd.apple.mpegurl"
                cache_control = "no-cache"
            elif file.endswith(".ts"):
                content_type = "video/MP2T"
                cache_control = "public, max-age=31536000, immutable"
            else:
                continue

            s3.upload_file(
                full_path,
                settings.s3_bucket,
                s3_key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": cache_control,
                },
            )
