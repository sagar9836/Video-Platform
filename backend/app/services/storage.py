from __future__ import annotations

import shutil
from pathlib import Path, PurePosixPath

from app.core.config import settings


def get_storage_backend() -> str:
    return settings.storage_backend.strip().lower()


def is_local_storage() -> bool:
    return get_storage_backend() == "local"


def is_s3_storage() -> bool:
    return get_storage_backend() == "s3"


def get_local_media_root() -> Path:
    root = Path(settings.local_media_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _key_to_relative_path(key: str) -> Path:
    return Path(*PurePosixPath(key).parts)


def _local_asset_path(key: str) -> Path:
    root = get_local_media_root()
    path = (root / _key_to_relative_path(key)).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Invalid storage key: {key}")
    return path


def local_asset_exists(key: str) -> bool:
    return _local_asset_path(key).is_file()


def save_upload_file_locally(upload_file, key: str) -> None:
    target = _local_asset_path(key)
    target.parent.mkdir(parents=True, exist_ok=True)

    with target.open("wb") as destination:
        shutil.copyfileobj(upload_file.file, destination)


def copy_file_to_local_storage(source_path: str, key: str) -> None:
    target = _local_asset_path(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target)


def copy_local_storage_file(key: str, destination_path: str) -> None:
    source = _local_asset_path(key)
    if not source.exists():
        raise FileNotFoundError(f"Stored file not found for key: {key}")

    destination = Path(destination_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def list_local_keys(prefix: str) -> list[str]:
    prefix_root = _local_asset_path(prefix)
    if not prefix_root.exists():
        return []

    media_root = get_local_media_root()
    return sorted(
        path.relative_to(media_root).as_posix()
        for path in prefix_root.rglob("*")
        if path.is_file()
    )


def delete_local_keys(keys: list[str]) -> None:
    for key in keys:
        path = _local_asset_path(key)
        if path.exists():
            path.unlink()


def build_public_asset_url(key: str) -> str | None:
    if is_local_storage():
        return f"{settings.media_base_url.rstrip('/')}/{key}"

    if settings.cloudfront_domain:
        return f"https://{settings.cloudfront_domain}/{key}"

    return None
