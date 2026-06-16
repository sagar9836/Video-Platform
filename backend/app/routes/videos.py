# app/routes/video.py

import asyncio
import uuid
import logging

from botocore.client import Config
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.creator import Creator
from app.models.video import Video, VideoStatus, VideoVisibility
from app.schemas.video import (
    VideoCreateRequest,
    VideoUploadResponse,
    VideoVisibilityUpdateRequest,
)
from app.dependencies.auth import get_current_user
from app.kafka.producer import send_event
from app.kafka.topics import VIDEO_PROCESSING_STARTED, VIDEO_UPLOADED
from app.redis.client import redis_client
from app.services.storage import (
    build_local_asset_url,
    build_public_asset_url,
    get_storage_backend,
    is_hybrid_storage,
    local_asset_path,
    local_asset_exists,
    save_upload_file_locally,
    uses_local_storage,
    uses_s3_storage,
)
from app.services.video_assets import delete_video_assets
from app.utils.aws import create_aws_client
from app.utils.s3 import generate_presigned_upload_url

router = APIRouter(prefix="/videos", tags=["Videos"])
logger = logging.getLogger("video-api")

s3 = create_aws_client(
    "s3",
    config=Config(connect_timeout=30, read_timeout=900),
)

# ======================================================
# HELPERS
# ======================================================

async def _get_creator(db: AsyncSession, user_id: int) -> Creator:
    creator = await db.scalar(select(Creator).where(Creator.user_id == user_id))
    if not creator:
        raise HTTPException(403, "Only creators can upload videos")
    return creator


async def _start_processing(video: Video):
    # 🔥 prevent duplicate triggers
    existing = await redis_client.get(f"video:{video.id}:status")
    if existing == "PROCESSING":
        return

    await redis_client.set(f"video:{video.id}:status", "PROCESSING", ex=3600)

    await send_event(
        VIDEO_PROCESSING_STARTED,
        {
            "video_id": video.id,
            "s3_key": video.s3_key,
            "creator_id": video.creator_id,
            "title": video.title,
        },
    )


def _upload_file(file: UploadFile, key: str):
    if uses_local_storage():
        save_upload_file_locally(file, key)

    if uses_s3_storage():
        if is_hybrid_storage():
            try:
                s3.upload_file(str(local_asset_path(key)), settings.s3_bucket, key)
            except Exception:
                logger.exception(
                    "Hybrid cloud sync failed for bucket=%s key=%s",
                    settings.s3_bucket,
                    key,
                )
            return

        s3.upload_fileobj(file.file, settings.s3_bucket, key)


def _check_storage(key: str):
    if uses_s3_storage():
        try:
            s3.head_object(Bucket=settings.s3_bucket, Key=key)
            return
        except Exception:
            if not uses_local_storage():
                raise

    if uses_local_storage() and local_asset_exists(key):
        return

    raise FileNotFoundError(f"Stored asset missing: {key}")


def _resolve_visibility(raw_visibility: str | None) -> VideoVisibility:
    if not raw_visibility:
        return VideoVisibility.PUBLIC

    try:
        return VideoVisibility(str(raw_visibility).upper())
    except ValueError as exc:
        raise HTTPException(400, "Invalid visibility") from exc


def _is_local_request(request: Request) -> bool:
    forwarded_host = request.headers.get("host", "")
    hostname = forwarded_host.split(":", 1)[0].lower()
    return hostname in {"localhost", "127.0.0.1"}


# ======================================================
# 🎥 CREATE UPLOAD SESSION (PRESIGNED)
# ======================================================

@router.post("/upload", response_model=VideoUploadResponse)
async def create_upload(
    data: VideoCreateRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    visibility = _resolve_visibility(data.visibility)

    video_uuid = uuid.uuid4().hex
    s3_key = f"videos/raw/{creator.id}/{video_uuid}/original.mp4"

    video = Video(
        creator_id=creator.id,
        title=data.title,
        description=data.description or "",
        s3_key=s3_key,
        status=VideoStatus.AWAITING_UPLOAD,
        visibility=visibility,
    )

    db.add(video)
    await db.commit()
    await db.refresh(video)

    upload_url = None
    if not uses_local_storage():
        upload_url = generate_presigned_upload_url(settings.s3_bucket, s3_key)

    return {
        "video_id": video.id,
        "upload_url": upload_url,
        "storage_backend": get_storage_backend(),
    }


# ======================================================
# 📤 DIRECT UPLOAD
# ======================================================

@router.post("/upload-direct")
async def upload_direct(
    title: str = Form(...),
    description: str = Form(""),
    visibility: str = Form("PUBLIC"),
    file: UploadFile = File(...),
    video_id: int | None = Form(None),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    clean_title = title.strip()
    clean_description = description.strip()
    next_visibility = _resolve_visibility(visibility)

    if video_id:
        video = await db.get(Video, video_id)
        if not video or video.creator_id != creator.id:
            raise HTTPException(403, "Unauthorized")
        video.title = clean_title or video.title
        video.description = clean_description
        video.visibility = next_visibility
    else:
        video_uuid = uuid.uuid4().hex
        s3_key = f"videos/raw/{creator.id}/{video_uuid}/original.mp4"

        video = Video(
            creator_id=creator.id,
            title=clean_title,
            description=clean_description,
            s3_key=s3_key,
            status=VideoStatus.UPLOADED,
            visibility=next_visibility,
        )

        db.add(video)
        await db.commit()
        await db.refresh(video)

    try:
        await file.seek(0)
        await asyncio.to_thread(_upload_file, file, video.s3_key)
    except Exception:
        logger.exception(
            "Storage upload failed for bucket=%s key=%s video_id=%s",
            settings.s3_bucket,
            video.s3_key,
            video.id,
        )
        video.status = VideoStatus.FAILED
        await db.commit()
        raise HTTPException(500, "Upload failed")

    # mark uploaded
    video.status = VideoStatus.UPLOADED
    await db.commit()

    # notify subscribers
    await send_event(
        VIDEO_UPLOADED,
        {
            "video_id": video.id,
            "creator_id": video.creator_id,
            "title": video.title,
        },
    )

    # start processing
    video.status = VideoStatus.PROCESSING
    await db.commit()

    await _start_processing(video)

    return {
        "video_id": video.id,
        "status": "PROCESSING",
    }


# ======================================================
# ✅ COMPLETE UPLOAD (PRESIGNED FLOW)
# ======================================================

@router.post("/{video_id}/complete")
async def complete_upload(
    video_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    creator = await _get_creator(db, int(user["sub"]))
    if creator.id != video.creator_id:
        raise HTTPException(403, "Unauthorized")

    if video.status == VideoStatus.PROCESSING:
        return {"message": "Already processing"}

    try:
        await asyncio.to_thread(_check_storage, video.s3_key)
    except Exception:
        logger.exception(
            "Storage object verification failed for bucket=%s key=%s video_id=%s",
            settings.s3_bucket,
            video.s3_key,
            video.id,
        )
        raise HTTPException(400, "File not uploaded")

    video.status = VideoStatus.PROCESSING
    await db.commit()

    await send_event(
        VIDEO_UPLOADED,
        {
            "video_id": video.id,
            "creator_id": video.creator_id,
            "title": video.title,
        },
    )

    await _start_processing(video)

    return {"message": "Processing started"}


# ======================================================
# 📡 STATUS
# ======================================================

@router.get("/{video_id}/status")
async def get_status(video_id: int, db: AsyncSession = Depends(get_db)):
    status = await redis_client.get(f"video:{video_id}:status")
    error = await redis_client.get(f"video:{video_id}:error")

    if status:
        return {"status": status, "error": error}

    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    return {"status": video.status.value}


# ======================================================
# ▶️ PLAY (FIXED)
# ======================================================

@router.get("/{video_id}/play")
async def play(
    video_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(Video, video_id)

    if not video:
        raise HTTPException(404, "Video not found")

    if video.status != VideoStatus.READY:
        raise HTTPException(400, "Video not ready")

    path = f"videos/hls/{video.id}/master.m3u8"
    use_cloud_url = False
    prefer_local = is_hybrid_storage() and _is_local_request(request)
    if prefer_local and uses_local_storage() and local_asset_exists(path):
        asset_ready = True
    elif uses_s3_storage() and _check_s3_playable(path):
        asset_ready = True
        use_cloud_url = True
    elif uses_local_storage() and local_asset_exists(path):
        asset_ready = True
    else:
        asset_ready = False

    if not asset_ready:
        raise HTTPException(503, "Still processing")

    # 🔥 CACHE BUSTING
    thumbnail_path = f"videos/thumbnails/{video.id}/thumbnail.jpg"
    if use_cloud_url:
        hls_url = build_public_asset_url(path)
        thumbnail_url = build_public_asset_url(thumbnail_path)
    else:
        hls_url = build_local_asset_url(path)
        thumbnail_url = build_local_asset_url(thumbnail_path)

    return {
        "video_id": video.id,
        "hls_url": f"{hls_url}?v={video.id}" if hls_url else None,
        "thumbnail_url": f"{thumbnail_url}?v={video.id}" if thumbnail_url else None,
    }


def _check_s3_playable(key: str) -> bool:
    try:
        s3.head_object(Bucket=settings.s3_bucket, Key=key)
        return True
    except Exception:
        return False


@router.patch("/{video_id}/visibility")
async def update_visibility(
    video_id: int,
    data: VideoVisibilityUpdateRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    video = await db.get(Video, video_id)

    if not video:
        raise HTTPException(404, "Video not found")
    if video.creator_id != creator.id:
        raise HTTPException(403, "Unauthorized")

    video.visibility = _resolve_visibility(data.visibility)
    await db.commit()
    await db.refresh(video)

    return {
        "video_id": video.id,
        "visibility": video.visibility.value,
    }


@router.delete("/{video_id}")
async def delete_video(
    video_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    video = await db.get(Video, video_id)

    if not video:
        raise HTTPException(404, "Video not found")
    if video.creator_id != creator.id:
        raise HTTPException(403, "Unauthorized")

    try:
        await asyncio.to_thread(delete_video_assets, video)
    except Exception:
        logger.exception("Failed deleting video assets for video_id=%s", video_id)

    await db.delete(video)
    await db.commit()

    await redis_client.delete(f"video:{video_id}:status")
    await redis_client.delete(f"video:{video_id}:error")

    return {"detail": "Video deleted"}
