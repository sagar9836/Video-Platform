import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from logging import Logger

import boto3
from botocore.client import Config

from config import settings

S3_CONNECT_TIMEOUT_SECONDS = 30
S3_READ_TIMEOUT_SECONDS = 15 * 60
DEFAULT_UPLOAD_WORKERS = 8


# 🔥 FAIL FAST (CRITICAL)
if not settings.aws_region:
    raise ValueError("AWS_REGION is missing")

if not settings.s3_bucket:
    raise ValueError("S3_BUCKET is missing")


# ✅ S3 CLIENT
s3 = boto3.client(
    "s3",
    region_name=settings.aws_region,
    config=Config(
        connect_timeout=S3_CONNECT_TIMEOUT_SECONDS,
        read_timeout=S3_READ_TIMEOUT_SECONDS,
        retries={"max_attempts": 5, "mode": "standard"},
    ),
)


# ---------------- DOWNLOAD ----------------
def download_from_s3(s3_key: str, local_path: str):
    s3.download_file(settings.s3_bucket, s3_key, local_path)


# ---------------- SINGLE UPLOAD ----------------
def _upload_file(local_path: str, s3_key: str, content_type: str, cache_control: str):
    s3.upload_file(
        local_path,
        settings.s3_bucket,
        s3_key,
        ExtraArgs={
            "ContentType": content_type,
            "CacheControl": cache_control,
        },
    )


# ---------------- THUMBNAIL ----------------
def upload_thumbnail_to_s3(video_id: int, thumbnail_path: str) -> str:
    s3_key = f"videos/thumbnails/{video_id}/thumbnail.jpg"

    s3.upload_file(
        thumbnail_path,
        settings.s3_bucket,
        s3_key,
        ExtraArgs={
            "ContentType": "image/jpeg",
            "CacheControl": "no-cache",
        },
    )

    return s3_key


# ---------------- HLS FILES ----------------
def _iter_hls_uploads(video_id: int, hls_dir: str):
    prefix = f"videos/hls/{video_id}"
    jobs = []

    for root, _, files in os.walk(hls_dir):
        for file in sorted(files):
            full_path = os.path.join(root, file)
            s3_key = f"{prefix}/{file}"

            if file.endswith(".m3u8"):
                jobs.append((full_path, s3_key, "application/vnd.apple.mpegurl", "no-cache"))
            elif file.endswith(".ts"):
                jobs.append((full_path, s3_key, "video/MP2T", "public, max-age=31536000, immutable"))

    return jobs


# ---------------- PARALLEL UPLOAD ----------------
def upload_hls_to_s3(video_id: int, hls_dir: str, logger: Logger | None = None):
    jobs = _iter_hls_uploads(video_id, hls_dir)

    if not jobs:
        raise ValueError(f"No HLS files found for video {video_id}")

    workers = int(os.getenv("S3_UPLOAD_WORKERS", DEFAULT_UPLOAD_WORKERS))

    if logger:
        logger.info(f"☁️ Uploading {len(jobs)} files with {workers} workers")

    completed = 0

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [
            executor.submit(_upload_file, path, key, ctype, cache)
            for path, key, ctype, cache in jobs
        ]

        for future in as_completed(futures):
            future.result()
            completed += 1

            if logger and completed % 20 == 0:
                logger.info(f"Progress: {completed}/{len(jobs)}")

    return completed