import os
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from logging import Logger
from pathlib import Path, PurePosixPath

import boto3
from botocore.client import Config

from config import settings

S3_CONNECT_TIMEOUT_SECONDS = 30
S3_READ_TIMEOUT_SECONDS = 15 * 60
DEFAULT_UPLOAD_WORKERS = 8


def _storage_backend() -> str:
    return settings.storage_backend.strip().lower()


def _is_local_storage() -> bool:
    return _storage_backend() == "local"


def _local_media_root() -> Path:
    root = Path(settings.local_media_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _local_key_path(key: str) -> Path:
    root = _local_media_root()
    path = (root / Path(*PurePosixPath(key).parts)).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Invalid storage key: {key}")
    return path


if not _is_local_storage():
    if not settings.aws_region:
        raise ValueError("AWS_REGION is missing")

    if not settings.s3_bucket:
        raise ValueError("S3_BUCKET is missing")


def _build_s3_client():
    if _is_local_storage():
        return None

    client_kwargs = {
        "region_name": settings.aws_region,
        "config": Config(
            connect_timeout=S3_CONNECT_TIMEOUT_SECONDS,
            read_timeout=S3_READ_TIMEOUT_SECONDS,
            retries={"max_attempts": 5, "mode": "standard"},
        ),
    }

    if settings.aws_access_key_id:
        client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
    if settings.aws_secret_access_key:
        client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    if settings.aws_session_token:
        client_kwargs["aws_session_token"] = settings.aws_session_token

    return boto3.client("s3", **client_kwargs)


# ✅ S3 CLIENT
s3 = _build_s3_client()


# ---------------- DOWNLOAD ----------------
def download_from_s3(s3_key: str, local_path: str):
    if _is_local_storage():
        source = _local_key_path(s3_key)
        if not source.exists():
            raise FileNotFoundError(f"Local source file missing: {s3_key}")

        destination = Path(local_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return

    s3.download_file(settings.s3_bucket, s3_key, local_path)


# ---------------- SINGLE UPLOAD ----------------
def _upload_file(local_path: str, s3_key: str, content_type: str, cache_control: str):
    if _is_local_storage():
        target = _local_key_path(s3_key)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_path, target)
        return

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

    if _is_local_storage():
        _upload_file(thumbnail_path, s3_key, "image/jpeg", "no-cache")
        return s3_key

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
