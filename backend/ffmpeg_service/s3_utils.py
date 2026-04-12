import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from logging import Logger

import boto3
from botocore.client import Config

from config import settings

S3_CONNECT_TIMEOUT_SECONDS = 30
S3_READ_TIMEOUT_SECONDS = 15 * 60
DEFAULT_UPLOAD_WORKERS = 8

s3 = boto3.client(
    "s3",
    region_name=settings.aws_region,
    config=Config(
        connect_timeout=S3_CONNECT_TIMEOUT_SECONDS,
        read_timeout=S3_READ_TIMEOUT_SECONDS,
        retries={"max_attempts": 5, "mode": "standard"},
    ),
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


def _upload_file(local_path: str, s3_key: str, content_type: str, cache_control: str) -> None:
    s3.upload_file(
        local_path,
        settings.s3_bucket,
        s3_key,
        ExtraArgs={
            "ContentType": content_type,
            "CacheControl": cache_control,
        },
    )


def upload_thumbnail_to_s3(video_id: int, thumbnail_path: str) -> str:
    s3_key = f"videos/thumbnails/{video_id}/thumbnail.jpg"
    s3.upload_file(
        thumbnail_path,
        settings.s3_bucket,
        s3_key,
        ExtraArgs={
            "ContentType": "image/jpeg",
            "CacheControl": "public, max-age=31536000, immutable",
        },
    )
    return s3_key


def _iter_hls_uploads(video_id: int, hls_dir: str) -> list[tuple[str, str, str, str]]:
    prefix = f"videos/hls/{video_id}"
    upload_jobs: list[tuple[str, str, str, str]] = []

    for root, _, files in os.walk(hls_dir):
        for file in sorted(files):
            full_path = os.path.join(root, file)
            s3_key = f"{prefix}/{file}"

            if file.endswith(".m3u8"):
                content_type = "application/vnd.apple.mpegurl"
                cache_control = "no-cache"
            elif file.endswith(".ts"):
                content_type = "video/MP2T"
                cache_control = "public, max-age=31536000, immutable"
            else:
                continue

            upload_jobs.append((full_path, s3_key, content_type, cache_control))

    return upload_jobs


def upload_hls_to_s3(video_id: int, hls_dir: str, logger: Logger | None = None) -> int:
    """
    Upload HLS output (.m3u8 + .ts) to S3
    with correct MIME types & caching
    """
    upload_jobs = _iter_hls_uploads(video_id, hls_dir)
    if not upload_jobs:
        raise ValueError(f"No HLS files found to upload for video {video_id}")

    max_workers = max(1, int(os.getenv("S3_UPLOAD_WORKERS", str(DEFAULT_UPLOAD_WORKERS))))
    completed = 0

    if logger:
        logger.info(
            "☁️ Uploading HLS output to S3 | video=%s | files=%s | workers=%s",
            video_id,
            len(upload_jobs),
            max_workers,
        )

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(_upload_file, full_path, s3_key, content_type, cache_control)
            for full_path, s3_key, content_type, cache_control in upload_jobs
        ]

        for future in as_completed(futures):
            future.result()
            completed += 1
            if logger and (completed == len(upload_jobs) or completed % 25 == 0):
                logger.info(
                    "☁️ HLS upload progress | video=%s | completed=%s/%s",
                    video_id,
                    completed,
                    len(upload_jobs),
                )

    return completed
