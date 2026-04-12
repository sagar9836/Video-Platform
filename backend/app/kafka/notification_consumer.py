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
    VIDEO_PROCESSING_FAILED,
    VIDEO_READY,
    VIDEO_PROCESSING_STARTED,
    VIDEO_UPLOADED,
)
from app.services.notification import notify_creator, notify_subscribers

logger = logging.getLogger("notification-consumer")


async def _consume_forever() -> None:
    consumer = AIOKafkaConsumer(
        VIDEO_READY,
        VIDEO_UPLOADED,
        LIVE_STARTED,
        LIVE_ENDED,
        VIDEO_PROCESSING_FAILED,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        group_id="notification-group",
    )

    await consumer.start()
    logger.info("Notification consumer connected")
    try:
        async for raw_msg in consumer:
            msg = cast(ConsumerRecord, raw_msg)
            payload = msg.value
            if not isinstance(payload, dict):
                logger.warning(
                    "Skipping Kafka event with invalid payload | topic=%s payload=%r",
                    msg.topic,
                    payload,
                )
                continue

            await handle_event(msg.topic, cast(dict[str, Any], payload))
    finally:
        await consumer.stop()


async def start_notification_consumer() -> None:
    while True:
        try:
            await _consume_forever()
        except asyncio.CancelledError:
            logger.info("Notification consumer cancelled")
            raise
        except Exception:
            logger.exception(
                "Notification consumer crashed; retrying in 5 seconds"
            )
            await asyncio.sleep(5)


async def handle_event(topic: str, data: dict[str, Any]):
    async with AsyncSessionLocal() as db:
        creator_id = data.get("creator_id")
        if creator_id is None:
            logger.warning("Skipping Kafka event without creator_id | topic=%s payload=%r", topic, data)
            return

        title = data.get("title", "Untitled")

        if topic == VIDEO_READY:
            await notify_creator(
                creator_id=creator_id,
                message=f"Your video '{title}' is ready",
            )

        elif topic == VIDEO_UPLOADED:
            await notify_subscribers(
                creator_id=creator_id,
                message=f"New video uploaded: {title}",
                db=db,
            )

        elif topic == LIVE_STARTED:
            await notify_subscribers(
                creator_id=creator_id,
                message="Live stream started",
                db=db,
            )

        elif topic == LIVE_ENDED:
            await notify_creator(
                creator_id=creator_id,
                message="Your live stream has ended",
            )

        elif topic == VIDEO_PROCESSING_FAILED:
            await notify_creator(
                creator_id=creator_id,
                message=f"Your video '{title}' failed to process",
            )
