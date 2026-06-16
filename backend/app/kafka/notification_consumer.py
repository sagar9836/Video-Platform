# app/kafka/notification_consumer.py

import json
import logging
import asyncio
from typing import Any, cast

from aiokafka import AIOKafkaConsumer
from aiokafka.structs import ConsumerRecord

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.kafka.topics import (
    LIVE_ENDED,
    LIVE_STARTED,
    VIDEO_FAILED,
    VIDEO_READY,
    VIDEO_UPLOADED,
)
from app.services.notification import notify_creator, notify_subscribers

logger = logging.getLogger("notification-consumer")


# ---------------- CONSUMER LOOP ----------------
async def _consume_forever() -> None:
    consumer = AIOKafkaConsumer(
        VIDEO_READY,
        VIDEO_UPLOADED,
        LIVE_STARTED,
        LIVE_ENDED,
        VIDEO_FAILED,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        group_id="notification-group",
        enable_auto_commit=True,
    )

    await consumer.start()
    logger.info("🚀 Notification consumer started")

    try:
        async for raw_msg in consumer:
            msg = cast(ConsumerRecord, raw_msg)
            payload = msg.value

            if not isinstance(payload, dict):
                logger.warning(
                    "⚠️ Invalid payload | topic=%s payload=%r",
                    msg.topic,
                    payload,
                )
                continue

            await handle_event(msg.topic, payload)

    finally:
        await consumer.stop()


# ---------------- RETRY LOOP ----------------
async def start_notification_consumer() -> None:
    while True:
        try:
            await _consume_forever()
        except asyncio.CancelledError:
            logger.info("🛑 Notification consumer stopped")
            raise
        except Exception:
            logger.exception("❌ Consumer crashed, retrying in 5s")
            await asyncio.sleep(5)


# ---------------- EVENT HANDLER ----------------
async def handle_event(topic: str, data: dict[str, Any]):
    async with AsyncSessionLocal() as db:
        creator_id = data.get("creator_id")

        if not creator_id:
            logger.warning(
                "⚠️ Missing creator_id | topic=%s payload=%r",
                topic,
                data,
            )
            return

        title = data.get("title", "Untitled Video")
        join_url = data.get("join_url")
        video_id = data.get("video_id")

        try:
            if topic == VIDEO_READY:
                await notify_creator(
                    creator_id=creator_id,
                    message=f"🎉 Your video '{title}' is ready!",
                    notification_type="video-ready",
                    title=title,
                    video_id=video_id,
                )

            elif topic == VIDEO_UPLOADED:
                await notify_subscribers(
                    creator_id=creator_id,
                    message=f"📢 New video uploaded: {title}",
                    db=db,
                    notification_type="video-uploaded",
                    title=title,
                    video_id=video_id,
                )

            elif topic == LIVE_STARTED:
                await notify_subscribers(
                    creator_id=creator_id,
                    message="🔴 Live stream started",
                    db=db,
                    notification_type="live-started",
                    title=data.get("title", "Live stream"),
                    join_url=join_url,
                )

            elif topic == LIVE_ENDED:
                await notify_creator(
                    creator_id=creator_id,
                    message="📴 Your live stream has ended",
                    notification_type="live-ended",
                    title=data.get("title", "Live stream"),
                )

            elif topic == VIDEO_FAILED:
                await notify_creator(
                    creator_id=creator_id,
                    message=f"❌ Your video '{title}' failed to process",
                    notification_type="video-failed",
                    title=title,
                    video_id=video_id,
                )

        except Exception:
            logger.exception(
                "❌ Failed handling event | topic=%s payload=%r",
                topic,
                data,
            )
