import asyncio
import uuid

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.analytics import VideoLike
from app.models.comment import Comment
from app.models.creator import Creator
from app.models.video import Video, VideoStatus, VideoVisibility
from app.schemas.video import (
    VideoCreateRequest,
    VideoUploadResponse,
    VideoVisibilityUpdateRequest,
)
from app.dependencies.auth import get_current_user, get_current_user_optional
from app.kafka.producer import get_kafka_producer
from app.kafka.topics import VIDEO_PROCESSING_STARTED, VIDEO_VIEWED
from app.redis.client import redis_client
from app.services.video_assets import (
    build_video_play_url,
    build_video_thumbnail_url,
    delete_video_assets,
)
from app.utils.s3 import generate_presigned_upload_url

router = APIRouter(prefix="/videos", tags=["Videos"])

s3 = boto3.client(
    "s3",
    region_name=settings.aws_region,
    config=Config(
        connect_timeout=30,
        read_timeout=15 * 60,
        retries={"max_attempts": 3},
    ),
)


def _require_video_storage() -> None:
    if not settings.s3_bucket:
        raise HTTPException(500, "S3_BUCKET is not configured")
    if not settings.cloudfront_domain:
        raise HTTPException(500, "CLOUDFRONT_DOMAIN is not configured")


async def _get_creator_for_user(
    db: AsyncSession,
    user_id: int,
) -> Creator:
    creator = await db.scalar(
        select(Creator).where(Creator.user_id == user_id)
    )
    if not creator:
        raise HTTPException(403, "Only creators can upload videos")
    return creator


async def _get_creator_for_user_optional(
    db: AsyncSession,
    user_id: int | None,
) -> Creator | None:
    if user_id is None:
        return None

    return await db.scalar(select(Creator).where(Creator.user_id == user_id))


async def _can_access_video(
    db: AsyncSession,
    video: Video,
    user: dict | None,
) -> bool:
    if video.visibility == VideoVisibility.PUBLIC:
        return True

    viewer_id = int(user["sub"]) if user else None
    viewer_creator = await _get_creator_for_user_optional(db, viewer_id)
    return bool(viewer_creator and viewer_creator.id == video.creator_id)


def _serialize_video(video: Video) -> dict:
    return {
        "id": video.id,
        "title": video.title,
        "description": video.description,
        "creator_id": video.creator_id,
        "status": video.status.value,
        "visibility": video.visibility.value,
        "play_url": (
            build_video_play_url(video.id)
            if video.status == VideoStatus.READY
            else None
        ),
        "thumbnail_url": build_video_thumbnail_url(video),
    }


async def _start_video_processing(video: Video) -> None:
    await redis_client.set(
        f"video:{video.id}:status",
        "PROCESSING",
        ex=3600,
    )

    producer = await get_kafka_producer()
    await producer.send_and_wait(
        VIDEO_PROCESSING_STARTED,
        {
            "video_id": video.id,
            "s3_key": video.s3_key,
        },
    )


def _build_extra_upload_args(file: UploadFile) -> dict:
    extra_args = {}
    if file.content_type:
        extra_args["ContentType"] = file.content_type
    return extra_args


def _normalize_text_field(value: str | None) -> str:
    return (value or "").strip()


def _upload_fileobj_to_s3(file: UploadFile, s3_key: str) -> None:
    s3.upload_fileobj(
        file.file,
        settings.s3_bucket,
        s3_key,
        ExtraArgs=_build_extra_upload_args(file) or None,
    )


def _ensure_s3_object_exists(s3_key: str) -> None:
    s3.head_object(
        Bucket=settings.s3_bucket,
        Key=s3_key,
    )

# ======================================================
# 🎥 UPLOAD VIDEO (PRESIGNED URL)
# ======================================================
@router.post("/upload", response_model=VideoUploadResponse)
async def generate_upload_url(
    data: VideoCreateRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.s3_bucket:
        raise HTTPException(500, "S3_BUCKET is not configured")

    creator = await _get_creator_for_user(db, int(user["sub"]))

    video_uuid = uuid.uuid4().hex
    s3_key = f"videos/raw/{creator.id}/{video_uuid}/original.mp4"

    video = Video(
        creator_id=creator.id,
        title=data.title,
        description=data.description or "",
        s3_key=s3_key,
        status=VideoStatus.AWAITING_UPLOAD,
        visibility=VideoVisibility.PUBLIC,
    )

    db.add(video)
    await db.commit()
    await db.refresh(video)

    upload_url = generate_presigned_upload_url(
        bucket=settings.s3_bucket,
        key=s3_key,
    )

    return {
        "video_id": video.id,
        "upload_url": upload_url,
    }


@router.post("/upload-direct")
async def upload_video_direct(
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    video_id: int | None = Form(None),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.s3_bucket:
        raise HTTPException(500, "S3_BUCKET is not configured")

    creator = await _get_creator_for_user(db, int(user["sub"]))
    if not file.filename:
        raise HTTPException(400, "Video file is required")

    if video_id is not None:
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(404, "Upload session not found")
        if video.creator_id != creator.id:
            raise HTTPException(403, "You do not have access to this upload")
        if video.status not in {VideoStatus.AWAITING_UPLOAD, VideoStatus.UPLOADED, VideoStatus.FAILED}:
            raise HTTPException(409, "Upload session is already in progress")

        video.title = _normalize_text_field(title)
        video.description = description or ""
        video.visibility = VideoVisibility.PUBLIC
        s3_key = video.s3_key
    else:
        video_uuid = uuid.uuid4().hex
        s3_key = f"videos/raw/{creator.id}/{video_uuid}/original.mp4"

        video = Video(
            creator_id=creator.id,
            title=_normalize_text_field(title),
            description=description or "",
            s3_key=s3_key,
            status=VideoStatus.UPLOADED,
            visibility=VideoVisibility.PUBLIC,
        )

        db.add(video)
        await db.commit()
        await db.refresh(video)

    try:
        await file.seek(0)
        await asyncio.to_thread(_upload_fileobj_to_s3, file, s3_key)
    except Exception:
        video.status = VideoStatus.FAILED
        await db.commit()
        raise HTTPException(500, "Failed to upload video file")
    finally:
        await file.close()

    video.status = VideoStatus.PROCESSING
    await db.commit()

    await _start_video_processing(video)

    return {
        "detail": "Upload received and processing started",
        "video_id": video.id,
        "status": "PROCESSING",
    }


# ======================================================
# ✅ COMPLETE UPLOAD (START PROCESSING)
# ======================================================
@router.post("/{video_id}/complete")
async def complete_video_upload(
    video_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.s3_bucket:
        raise HTTPException(500, "S3_BUCKET is not configured")

    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    creator = await _get_creator_for_user(db, int(user["sub"]))
    if creator.id != video.creator_id:
        raise HTTPException(403, "You do not have access to this video")

    if video.status == VideoStatus.READY:
        return {"detail": "Video is already ready"}
    if video.status == VideoStatus.PROCESSING:
        return {"detail": "Video is already processing"}

    try:
        await asyncio.to_thread(_ensure_s3_object_exists, video.s3_key)
    except ClientError:
        raise HTTPException(400, "Video file not uploaded yet")

    video.status = VideoStatus.PROCESSING
    await db.commit()

    await _start_video_processing(video)

    return {"detail": "Processing started"}


# ======================================================
# 📡 VIDEO STATUS (REDIS)
# ======================================================
@router.get("/{video_id}/status")
async def get_video_status(
    video_id: int,
    db: AsyncSession = Depends(get_db),
):
    status = await redis_client.get(f"video:{video_id}:status")
    error = await redis_client.get(f"video:{video_id}:error")
    if status:
        return {"status": status, "error": error}

    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    return {"status": video.status.value, "error": None}


# ======================================================
# ▶️ PLAY VIDEO (HLS)
# ======================================================
@router.get("/{video_id}/play")
async def play_video(
    video_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user_optional),
):
    _require_video_storage()

    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    if not await _can_access_video(db, video, user):
        raise HTTPException(404, "Video not found")

    if video.status != VideoStatus.READY:
        raise HTTPException(400, "Video not ready")

    hls_path = f"videos/hls/{video.id}/master.m3u8"

    try:
        s3.head_object(
            Bucket=settings.s3_bucket,
            Key=hls_path,
        )
    except ClientError:
        raise HTTPException(
            status_code=503,
            detail="Video is still processing",
        )

    is_guest = user is None

    return {
        "hls_url": f"https://{settings.cloudfront_domain}/{hls_path}",
        "thumbnail_url": build_video_thumbnail_url(video),
        "video": {
            "id": video.id,
            "title": video.title,
            "description": video.description,
            "creator_id": video.creator_id,
            "visibility": video.visibility.value,
            "thumbnail_url": build_video_thumbnail_url(video),
        },
        "preview": {
            "guest_mode": is_guest,
            "allowed_fraction": 0.25,
            "message": (
                "Please login or signup to continue watching after preview"
                if is_guest
                else None
            ),
        },
    }


# ======================================================
# 📊 REGISTER VIEW (ASYNC)
# ======================================================
@router.post("/{video_id}/view")
async def register_view(
    video_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user_optional),
):
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if not await _can_access_video(db, video, user):
        raise HTTPException(404, "Video not found")

    producer = await get_kafka_producer()
    await producer.send_and_wait(
        VIDEO_VIEWED,
        {
            "video_id": video_id,
            "user_id": int(user["sub"]) if user else None,
            "ip": request.client.host if request.client else None,
        },
    )
    return {"status": "ok"}


# ======================================================
# ❤️ LIKE / UNLIKE (ONE PER USER)
# ======================================================
@router.post("/{video_id}/like")
async def toggle_like(
    video_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if not await _can_access_video(db, video, user):
        raise HTTPException(404, "Video not found")

    result = await db.scalar(
        select(VideoLike)
        .where(VideoLike.video_id == video_id)
        .where(VideoLike.user_id == int(user["sub"]))
    )

    if result:
        await db.delete(result)
    else:
        db.add(VideoLike(video_id=video_id, user_id=int(user["sub"])))

    await db.commit()
    return {"status": "ok"}


# ======================================================
# 💬 ADD COMMENT
# ======================================================
@router.post("/{video_id}/comment")
async def add_comment(
    video_id: int,
    payload: dict,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if "text" not in payload or not payload["text"].strip():
        raise HTTPException(400, "Comment text required")

    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if not await _can_access_video(db, video, user):
        raise HTTPException(404, "Video not found")

    comment = Comment(
        video_id=video_id,
        user_id=int(user["sub"]),
        content=payload["text"].strip(),
    )

    db.add(comment)
    await db.commit()
    return {"status": "ok"}


# ======================================================
# 🆕 GET VIDEO BY ID (PUBLIC)
# ======================================================
@router.get("/{video_id}")
async def get_video_by_id(
    video_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user_optional),
):
    video = await db.get(Video, video_id)
    creator = await db.get(Creator, video.creator_id) if video else None
    if not video or video.status != VideoStatus.READY:
        raise HTTPException(404, "Video not found")
    if not await _can_access_video(db, video, user):
        raise HTTPException(404, "Video not found")

    return {
        "id": video.id,
        "title": video.title,
        "description": video.description,
        "visibility": video.visibility.value,
        "thumbnail_url": build_video_thumbnail_url(video),
         "creator": {
            "id": creator.id,
            "channel_name": creator.channel_name,
            "subscribers_count": creator.subscribers_count,
        } if creator else None,
    }


@router.patch("/{video_id}/visibility")
async def update_video_visibility(
    video_id: int,
    payload: VideoVisibilityUpdateRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    creator = await _get_creator_for_user(db, int(user["sub"]))
    if creator.id != video.creator_id:
        raise HTTPException(403, "You do not have access to this video")

    try:
        visibility = VideoVisibility(payload.visibility.strip().upper())
    except ValueError as exc:
        raise HTTPException(400, "Visibility must be PUBLIC or PRIVATE") from exc

    video.visibility = visibility
    await db.commit()
    await db.refresh(video)

    return {"video": _serialize_video(video)}


@router.delete("/{video_id}")
async def delete_video(
    video_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    creator = await _get_creator_for_user(db, int(user["sub"]))
    if creator.id != video.creator_id:
        raise HTTPException(403, "You do not have access to this video")

    await asyncio.to_thread(delete_video_assets, video)
    await redis_client.delete(
        f"video:{video.id}:status",
        f"video:{video.id}:error",
    )
    await db.delete(video)
    await db.commit()

    return {"detail": "Video deleted"}


# ======================================================
# 🌍 LIST ALL PUBLIC VIDEOS
# ======================================================
@router.get("/")
async def list_videos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Video)
        .where(
            Video.status == VideoStatus.READY,
            Video.visibility == VideoVisibility.PUBLIC,
        )
        .order_by(Video.id.desc())
    )
    videos = result.scalars().all()

    return [_serialize_video(v) for v in videos]
