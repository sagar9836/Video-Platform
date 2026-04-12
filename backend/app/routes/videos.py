# ===================== video.py =====================
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
from app.models.creator import Creator
from app.models.video import Video, VideoStatus, VideoVisibility
from app.schemas.video import VideoCreateRequest, VideoUploadResponse
from app.dependencies.auth import get_current_user, get_current_user_optional
from app.kafka.producer import get_kafka_producer
from app.kafka.topics import VIDEO_PROCESSING_STARTED
from app.redis.client import redis_client
from app.utils.s3 import generate_presigned_upload_url

router = APIRouter(prefix="/videos", tags=["Videos"])

s3 = boto3.client(
    "s3",
    region_name=settings.aws_region,
    config=Config(connect_timeout=30, read_timeout=900, retries={"max_attempts": 3}),
)


# -------------------- HELPERS --------------------
async def _get_creator_for_user(db: AsyncSession, user_id: int) -> Creator:
    creator = await db.scalar(select(Creator).where(Creator.user_id == user_id))
    if not creator:
        raise HTTPException(403, "Only creators can upload videos")
    return creator


async def _start_processing(video: Video):
    # Redis update
    await redis_client.set(f"video:{video.id}:status", "PROCESSING", ex=3600)

    # Kafka event
    producer = await get_kafka_producer()
    await producer.send_and_wait(
        VIDEO_PROCESSING_STARTED,
        {
            "video_id": video.id,
            "s3_key": video.s3_key,
        },
    )


def _upload_fileobj(file: UploadFile, key: str):
    s3.upload_fileobj(file.file, settings.s3_bucket, key)


def _ensure_s3_file(key: str):
    s3.head_object(Bucket=settings.s3_bucket, Key=key)


# ======================================================
# 🎥 CREATE UPLOAD SESSION (PRESIGNED URL)
# ======================================================
@router.post("/upload", response_model=VideoUploadResponse)
async def create_upload(
    data: VideoCreateRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

    upload_url = generate_presigned_upload_url(settings.s3_bucket, s3_key)

    return {"video_id": video.id, "upload_url": upload_url}


# ======================================================
# 📤 DIRECT UPLOAD (FALLBACK)
# ======================================================
@router.post("/upload-direct")
async def upload_direct(
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    video_id: int | None = Form(None),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_for_user(db, int(user["sub"]))

    if video_id:
        video = await db.get(Video, video_id)
        if not video or video.creator_id != creator.id:
            raise HTTPException(403, "Unauthorized")

        s3_key = video.s3_key
    else:
        video_uuid = uuid.uuid4().hex
        s3_key = f"videos/raw/{creator.id}/{video_uuid}/original.mp4"

        video = Video(
            creator_id=creator.id,
            title=title.strip(),
            description=description,
            s3_key=s3_key,
            status=VideoStatus.UPLOADED,
            visibility=VideoVisibility.PUBLIC,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)

    try:
        await file.seek(0)
        await asyncio.to_thread(_upload_fileobj, file, s3_key)
    except Exception:
        video.status = VideoStatus.FAILED
        await db.commit()
        raise HTTPException(500, "Upload failed")

    # 🔥 START PROCESSING IMMEDIATELY
    video.status = VideoStatus.PROCESSING
    await db.commit()

    await _start_processing(video)

    return {"video_id": video.id, "status": "PROCESSING"}


# ======================================================
# ✅ COMPLETE UPLOAD (MAIN FLOW)
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

    creator = await _get_creator_for_user(db, int(user["sub"]))
    if creator.id != video.creator_id:
        raise HTTPException(403, "Unauthorized")

    # 🔥 Prevent duplicate processing
    if video.status == VideoStatus.PROCESSING:
        return {"message": "Already processing"}

    # 🔥 Ensure file exists in S3
    try:
        await asyncio.to_thread(_ensure_s3_file, video.s3_key)
    except Exception:
        raise HTTPException(400, "File not found in S3")

    video.status = VideoStatus.PROCESSING
    await db.commit()

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
        raise HTTPException(404)

    return {"status": video.status.value, "error": None}


# ======================================================
# ▶️ PLAY
# ======================================================
@router.get("/{video_id}/play")
async def play(video_id: int, db: AsyncSession = Depends(get_db)):
    video = await db.get(Video, video_id)
    if not video or video.status != VideoStatus.READY:
        raise HTTPException(400, "Not ready")

    path = f"videos/hls/{video.id}/master.m3u8"

    try:
        s3.head_object(Bucket=settings.s3_bucket, Key=path)
    except ClientError:
        raise HTTPException(503, "Still processing")

    return {
        "hls_url": f"https://{settings.cloudfront_domain}/{path}"
    }