import asyncio
import json
import os
import tempfile
import logging
import time

from aiokafka import AIOKafkaConsumer
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy import update

import redis.asyncio as redis

from config import settings
from models import Video, VideoStatus
from ffmpeg_utils import generate_thumbnail, transcode_to_hls
from s3_utils import download_from_s3, upload_hls_to_s3, upload_thumbnail_to_s3

VIDEO_PROCESSING_STARTED = "video.processing.started"
VIDEO_READY = "video.ready"
VIDEO_PROCESSING_FAILED = "video.processing.failed"
MAX_VIDEO_PROCESSING_MINUTES = 30


# -------------------- LOGGING (MANDATORY) --------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger("ffmpeg-worker")

# -------------------- REDIS --------------------
redis_client = redis.from_url(
    settings.redis_url,
    decode_responses=True,
)

# -------------------- DATABASE --------------------
engine = create_async_engine(
    settings.database_url,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
)


async def _update_video_record(
    video_id: int,
    status: VideoStatus | None = None,
    thumbnail_key: str | None = None,
) -> None:
    async with AsyncSessionLocal() as session:
        values = {}
        if status is not None:
            values["status"] = status.value
        if thumbnail_key is not None:
            values["thumbnail_key"] = thumbnail_key

        await session.execute(
            update(Video)
            .where(Video.id == video_id)
            .values(**values)
        )
        await session.commit()


async def _set_redis_status(video_id: int, status: str, error: str | None = None) -> None:
    await redis_client.set(
        f"video:{video_id}:status",
        status,
        ex=3600,
    )
    if error:
        await redis_client.set(
            f"video:{video_id}:error",
            error[:500],
            ex=3600,
        )
    else:
        await redis_client.delete(f"video:{video_id}:error")


# -------------------- MAIN CONSUMER --------------------
async def consume():
    logger.info("🚀 FFmpeg consumer booting")

    consumer = AIOKafkaConsumer(
        VIDEO_PROCESSING_STARTED,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id="ffmpeg-worker-v1",
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        max_poll_interval_ms=MAX_VIDEO_PROCESSING_MINUTES * 60 * 1000,
        value_deserializer=lambda v: json.loads(v.decode()),
    )

    await consumer.start()
    logger.info("✅ Kafka consumer connected")

    try:
        async for msg in consumer:
            logger.info(f"📩 Kafka message received: {msg.value}")

            video_id = msg.value["video_id"]
            s3_key = msg.value["s3_key"]

            try:
                await process_video(video_id, s3_key)
                await consumer.commit()
                logger.info(f"✅ Kafka offset committed | video={video_id}")

            except Exception as e:
                logger.exception(
                    f"❌ Processing failed | video={video_id} | error={e}"
                )
                await mark_failed(video_id, error=str(e))
                await consumer.commit()

    finally:
        await consumer.stop()


# -------------------- PROCESS VIDEO --------------------
async def process_video(video_id: int, s3_key: str):
    logger.info(f"🎬 Processing video {video_id}")

    await _set_redis_status(video_id, "PROCESSING")

    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, "input.mp4")
        hls_dir = os.path.join(tmp, "hls")
        thumbnail_path = os.path.join(tmp, "thumbnail.jpg")

        download_started = time.monotonic()
        logger.info("⬇️ Downloading source from S3 | video=%s | key=%s", video_id, s3_key)
        await asyncio.to_thread(download_from_s3, s3_key, input_path)
        logger.info(
            "⬇️ Source download complete | video=%s | seconds=%.2f",
            video_id,
            time.monotonic() - download_started,
        )

        thumbnail_started = time.monotonic()
        logger.info("🖼️ Generating thumbnail | video=%s", video_id)
        await asyncio.to_thread(generate_thumbnail, input_path, thumbnail_path)
        thumbnail_key = await asyncio.to_thread(upload_thumbnail_to_s3, video_id, thumbnail_path)
        logger.info(
            "🖼️ Thumbnail uploaded | video=%s | key=%s | seconds=%.2f",
            video_id,
            thumbnail_key,
            time.monotonic() - thumbnail_started,
        )

        transcode_started = time.monotonic()
        logger.info("🎞️ Starting HLS transcode | video=%s", video_id)
        await asyncio.to_thread(transcode_to_hls, input_path, hls_dir)
        logger.info(
            "🎞️ HLS transcode complete | video=%s | seconds=%.2f",
            video_id,
            time.monotonic() - transcode_started,
        )

        upload_started = time.monotonic()
        uploaded_files = await asyncio.to_thread(upload_hls_to_s3, video_id, hls_dir, logger)
        logger.info(
            "☁️ HLS upload complete | video=%s | files=%s | seconds=%.2f",
            video_id,
            uploaded_files,
            time.monotonic() - upload_started,
        )

    await _update_video_record(
        video_id,
        status=VideoStatus.READY,
        thumbnail_key=thumbnail_key,
    )
    await _set_redis_status(video_id, "READY")

    creator_id = await get_creator_id(video_id)
    try:
        await publish_event(
            VIDEO_READY,
            {
                "video_id": video_id,
                "creator_id": creator_id,
            },
        )
    except Exception:
        logger.exception(
            "⚠️ Failed to publish READY event | video=%s",
            video_id,
        )

    logger.info(f"🎉 Video {video_id} READY")


# -------------------- MARK FAILED --------------------
async def mark_failed(video_id: int, error: str | None = None):
    logger.warning(f"⚠️ Marking video {video_id} as FAILED")

    try:
        await _update_video_record(video_id, status=VideoStatus.FAILED)
    except Exception:
        logger.exception("❌ Failed to persist FAILED status | video=%s", video_id)

    await _set_redis_status(video_id, "FAILED", error=error)

    creator_id = await get_creator_id(video_id)
    try:
        await publish_event(
            VIDEO_PROCESSING_FAILED,
            {
                "video_id": video_id,
                "creator_id": creator_id,
            },
        )
    except Exception:
        logger.exception(
            "⚠️ Failed to publish FAILED event | video=%s",
            video_id,
        )


async def get_creator_id(video_id: int) -> int | None:
    async with AsyncSessionLocal() as session:
        video = await session.get(Video, video_id)
        return getattr(video, "creator_id", None) if video else None


async def publish_event(topic: str, payload: dict):
    from aiokafka import AIOKafkaProducer

    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    await producer.start()
    try:
        await producer.send_and_wait(topic, payload)
    finally:
        await producer.stop()


# -------------------- ENTRYPOINT --------------------
if __name__ == "__main__":
    asyncio.run(consume())

# import asyncio
# import json
# import os
# import tempfile

# from aiokafka import AIOKafkaConsumer
# from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
# from sqlalchemy.orm import sessionmaker
# from sqlalchemy import update

# import redis.asyncio as redis

# from config import settings
# from models import Video, VideoStatus
# from ffmpeg_utils import transcode_to_hls
# from s3_utils import download_from_s3, upload_hls_to_s3


# engine = create_async_engine(settings.database_url, echo=False)
# AsyncSessionLocal = sessionmaker(
#     engine, class_=AsyncSession, expire_on_commit=False
# )

# redis_client = redis.from_url(settings.redis_url, decode_responses=True)


# async def consume():
#     print("🚀 FFmpeg consumer starting...")

#     consumer = AIOKafkaConsumer(
#         "video.processing.started",
#         bootstrap_servers=settings.kafka_bootstrap_servers,
#         group_id="ffmpeg-group",
#         value_deserializer=lambda v: json.loads(v.decode()),
#         enable_auto_commit=False,  # 🔥 critical
#     )

#     await consumer.start()
#     print("✅ Kafka consumer started")

#     try:
#         async for msg in consumer:
#             payload = msg.value
#             video_id = payload["video_id"]
#             s3_key = payload["s3_key"]

#             try:
#                 print(f"▶️ Processing video {video_id}")

#                 with tempfile.TemporaryDirectory() as tmp:
#                     input_path = os.path.join(tmp, "input.mp4")
#                     hls_dir = os.path.join(tmp, "hls")

#                     await asyncio.to_thread(download_from_s3, s3_key, input_path)
#                     await asyncio.to_thread(transcode_to_hls, input_path, hls_dir)
#                     await asyncio.to_thread(upload_hls_to_s3, video_id, hls_dir)

#                 async with AsyncSessionLocal() as session:
#                     await session.execute(
#                         update(Video)
#                         .where(Video.id == video_id)
#                         .values(status=VideoStatus.READY)
#                     )
#                     await session.commit()

#                 await redis_client.set(
#                     f"video:{video_id}:status",
#                     "READY",
#                     ex=3600,
#                 )

#                 print("✅ Video READY")
#                 await consumer.commit()

#             except Exception as e:
#                 print("❌ Processing failed:", e)

#                 async with AsyncSessionLocal() as session:
#                     await session.execute(
#                         update(Video)
#                         .where(Video.id == video_id)
#                         .values(status=VideoStatus.FAILED)
#                     )
#                     await session.commit()

#                 await redis_client.set(
#                     f"video:{video_id}:status",
#                     "FAILED",
#                     ex=3600,
#                 )

#                 await consumer.commit()

#     finally:
#         await consumer.stop()


# if __name__ == "__main__":
#     asyncio.run(consume())
