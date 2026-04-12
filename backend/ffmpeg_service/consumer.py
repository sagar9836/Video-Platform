# ===================== consumer.py =====================
import asyncio
import json
import os
import tempfile
import logging

from aiokafka import AIOKafkaConsumer
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import update

import redis.asyncio as redis

from config import settings
from models import Video, VideoStatus
from ffmpeg_utils import generate_thumbnail, transcode_to_hls
from s3_utils import download_from_s3, upload_hls_to_s3, upload_thumbnail_to_s3


VIDEO_PROCESSING_STARTED = "video.processing.started"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ffmpeg-worker")

redis_client = redis.from_url(settings.redis_url, decode_responses=True)

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


# ---------------- DB UPDATE ----------------
async def update_status(video_id, status, thumbnail=None):
    async with AsyncSessionLocal() as session:
        values = {"status": status.value}
        if thumbnail:
            values["thumbnail_key"] = thumbnail

        await session.execute(
            update(Video).where(Video.id == video_id).values(**values)
        )
        await session.commit()


async def set_redis(video_id, status, error=None):
    await redis_client.set(f"video:{video_id}:status", status, ex=3600)
    if error:
        await redis_client.set(f"video:{video_id}:error", error[:300], ex=3600)


# ---------------- PROCESS ----------------
async def process_video(video_id, s3_key):
    logger.info(f"🎬 Start processing {video_id}")

    await set_redis(video_id, "PROCESSING")

    with tempfile.TemporaryDirectory() as tmp:
        input_path = f"{tmp}/input.mp4"
        hls_dir = f"{tmp}/hls"
        thumb = f"{tmp}/thumb.jpg"

        # DOWNLOAD
        logger.info("⬇️ Downloading...")
        await asyncio.to_thread(download_from_s3, s3_key, input_path)

        if not os.path.exists(input_path):
            raise RuntimeError("File not downloaded")

        # THUMBNAIL
        await asyncio.to_thread(generate_thumbnail, input_path, thumb)
        thumbnail_key = await asyncio.to_thread(
            upload_thumbnail_to_s3, video_id, thumb
        )

        # FFMPEG
        logger.info("🎞️ Transcoding...")
        await asyncio.wait_for(
            asyncio.to_thread(transcode_to_hls, input_path, hls_dir),
            timeout=1800,  # 30 min safety
        )

        # UPLOAD
        await asyncio.to_thread(upload_hls_to_s3, video_id, hls_dir, logger)

    await update_status(video_id, VideoStatus.READY, thumbnail_key)
    await set_redis(video_id, "READY")

    logger.info(f"✅ DONE {video_id}")


# ---------------- CONSUMER ----------------
async def consume():
    consumer = AIOKafkaConsumer(
        VIDEO_PROCESSING_STARTED,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id="ffmpeg-worker",
        enable_auto_commit=False,
        max_poll_records=1,  # 🔥 important
        value_deserializer=lambda v: json.loads(v.decode()),
    )

    await consumer.start()
    logger.info("🚀 Consumer started")

    try:
        async for msg in consumer:
            data = msg.value
            video_id = data["video_id"]
            s3_key = data["s3_key"]

            try:
                await process_video(video_id, s3_key)
                await consumer.commit()
            except Exception as e:
                logger.exception("❌ Failed")
                await update_status(video_id, VideoStatus.FAILED)
                await set_redis(video_id, "FAILED", str(e))
                await consumer.commit()

    finally:
        await consumer.stop()


if __name__ == "__main__":
    asyncio.run(consume())