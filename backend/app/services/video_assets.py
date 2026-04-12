import boto3
from botocore.client import Config

from app.core.config import settings
from app.models.video import Video

S3_DELETE_BATCH_SIZE = 1000


def _get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        config=Config(
            connect_timeout=30,
            read_timeout=15 * 60,
            retries={"max_attempts": 5, "mode": "standard"},
        ),
    )


def build_video_play_url(video_id: int) -> str | None:
    if not settings.cloudfront_domain:
        return None
    return f"https://{settings.cloudfront_domain}/videos/hls/{video_id}/master.m3u8"


def build_video_thumbnail_url(video: Video) -> str | None:
    if not settings.cloudfront_domain or not video.thumbnail_key:
        return None
    return f"https://{settings.cloudfront_domain}/{video.thumbnail_key}"


def build_thumbnail_s3_key(video_id: int) -> str:
    return f"videos/thumbnails/{video_id}/thumbnail.jpg"


def _delete_keys(bucket: str, keys: list[str]) -> None:
    if not keys:
        return

    s3 = _get_s3_client()
    for index in range(0, len(keys), S3_DELETE_BATCH_SIZE):
        batch = keys[index : index + S3_DELETE_BATCH_SIZE]
        s3.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
        )


def _list_prefix_keys(bucket: str, prefix: str) -> list[str]:
    s3 = _get_s3_client()
    keys: list[str] = []
    continuation_token: str | None = None

    while True:
        params = {"Bucket": bucket, "Prefix": prefix}
        if continuation_token:
            params["ContinuationToken"] = continuation_token

        response = s3.list_objects_v2(**params)
        keys.extend(obj["Key"] for obj in response.get("Contents", []))

        if not response.get("IsTruncated"):
            break

        continuation_token = response.get("NextContinuationToken")

    return keys


def delete_video_assets(video: Video) -> None:
    if not settings.s3_bucket:
        return

    keys_to_delete = set()
    if video.s3_key:
        keys_to_delete.add(video.s3_key)
    if video.thumbnail_key:
        keys_to_delete.add(video.thumbnail_key)

    hls_keys = _list_prefix_keys(settings.s3_bucket, f"videos/hls/{video.id}/")
    keys_to_delete.update(hls_keys)

    _delete_keys(settings.s3_bucket, sorted(keys_to_delete))
