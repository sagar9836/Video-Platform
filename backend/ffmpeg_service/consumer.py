import asyncio
import json
import os
import tempfile
import logging

from aiokafka import AIOKafkaConsumer
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy import update

import redis.asyncio as redis

from config import settings
from models import Video, VideoStatus
from ffmpeg_utils import transcode_to_hls
from s3_utils import download_from_s3, upload_hls_to_s3

VIDEO_PROCESSING_STARTED = "video.processing.started"
VIDEO_READY = "video.ready"
VIDEO_PROCESSING_FAILED = "video.processing.failed"


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


# -------------------- MAIN CONSUMER --------------------
async def consume():
    logger.info("🚀 FFmpeg consumer booting")

    consumer = AIOKafkaConsumer(
        VIDEO_PROCESSING_STARTED,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id="ffmpeg-worker-v1",
        enable_auto_commit=False,
        auto_offset_reset="latest",
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
                await mark_failed(video_id)
                await consumer.commit()

    finally:
        await consumer.stop()


# -------------------- PROCESS VIDEO --------------------
async def process_video(video_id: int, s3_key: str):
    logger.info(f"🎬 Processing video {video_id}")

    await redis_client.set(
        f"video:{video_id}:status",
        "PROCESSING",
        ex=3600,
    )

    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, "input.mp4")
        hls_dir = os.path.join(tmp, "hls")

        await asyncio.to_thread(download_from_s3, s3_key, input_path)
        await asyncio.to_thread(transcode_to_hls, input_path, hls_dir)
        await asyncio.to_thread(upload_hls_to_s3, video_id, hls_dir)

    async with AsyncSessionLocal() as session:
        await session.execute(
            update(Video)
            .where(Video.id == video_id)
            .values(status=VideoStatus.READY)
        )
        await session.commit()

    await redis_client.set(
        f"video:{video_id}:status",
        "READY",
        ex=3600,
    )

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
async def mark_failed(video_id: int):
    logger.warning(f"⚠️ Marking video {video_id} as FAILED")

    async with AsyncSessionLocal() as session:
        await session.execute(
            update(Video)
            .where(Video.id == video_id)
            .values(status=VideoStatus.FAILED)
        )
        await session.commit()

    await redis_client.set(
        f"video:{video_id}:status",
        "FAILED",
        ex=3600,
    )

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
