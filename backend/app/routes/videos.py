from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
import boto3
from botocore.exceptions import ClientError

from app.db.session import get_db
from app.models.video import Video, VideoStatus
from app.models.creator import Creator
from app.models.analytics import VideoLike
from app.models.comment import Comment
from app.schemas.video import VideoCreateRequest, VideoUploadResponse
from app.dependencies.auth import get_current_user, get_current_user_optional
from app.utils.s3 import generate_presigned_upload_url
from app.kafka.producer import get_kafka_producer
from app.kafka.topics import VIDEO_PROCESSING_STARTED, VIDEO_VIEWED
from app.redis.client import redis_client
from app.core.config import settings

router = APIRouter(prefix="/videos", tags=["Videos"])

s3 = boto3.client("s3", region_name=settings.aws_region)


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
        status=VideoStatus.UPLOADED,
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
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.s3_bucket:
        raise HTTPException(500, "S3_BUCKET is not configured")

    creator = await _get_creator_for_user(db, int(user["sub"]))
    if not file.filename:
        raise HTTPException(400, "Video file is required")

    video_uuid = uuid.uuid4().hex
    s3_key = f"videos/raw/{creator.id}/{video_uuid}/original.mp4"

    video = Video(
        creator_id=creator.id,
        title=title.strip(),
        description=description or "",
        s3_key=s3_key,
        status=VideoStatus.UPLOADED,
    )

    db.add(video)
    await db.commit()
    await db.refresh(video)

    try:
        await file.seek(0)
        extra_args = {}
        if file.content_type:
            extra_args["ContentType"] = file.content_type

        s3.upload_fileobj(
            file.file,
            settings.s3_bucket,
            s3_key,
            ExtraArgs=extra_args or None,
        )
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

    try:
        s3.head_object(
            Bucket=settings.s3_bucket,
            Key=video.s3_key,
        )
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
async def get_video_status(video_id: int):
    status = await redis_client.get(f"video:{video_id}:status")
    return {"status": status or "unknown"}


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
        "video": {
            "id": video.id,
            "title": video.title,
            "description": video.description,
            "creator_id": video.creator_id,
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
    user=Depends(get_current_user_optional),
):
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
):
    video = await db.get(Video, video_id)
    creator = await db.get(Creator, video.creator_id) if video else None
    if not video or video.status != VideoStatus.READY:
        raise HTTPException(404, "Video not found")

    return {
        "id": video.id,
        "title": video.title,
        "description": video.description,
         "creator": {
            "id": creator.id,
            "channel_name": creator.channel_name,
            "subscribers_count": creator.subscribers_count,
        } if creator else None,
    }


# ======================================================
# 🌍 LIST ALL PUBLIC VIDEOS
# ======================================================
@router.get("/")
async def list_videos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Video)
        .where(Video.status == VideoStatus.READY)
        .order_by(Video.id.desc())
    )
    videos = result.scalars().all()

    return [
        {
            "id": v.id,
            "title": v.title,
            "description": v.description,
            "creator_id": v.creator_id,
        }
        for v in videos
    ]
