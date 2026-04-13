# app/kafka/producer.py

import json
import logging
import asyncio
from typing import Optional

from aiokafka import AIOKafkaProducer
from app.core.config import settings

logger = logging.getLogger("kafka-producer")

_producer: Optional[AIOKafkaProducer] = None


async def get_kafka_producer() -> AIOKafkaProducer:
    global _producer

    if _producer is not None:
        return _producer

    if not settings.kafka_bootstrap_servers:
        raise RuntimeError("KAFKA_BOOTSTRAP_SERVERS is not set")

    _producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        acks="all",        # durability
        linger_ms=5,       # batching
        # ❌ retries removed (not supported in aiokafka)
    )

    await _producer.start()
    logger.info("🚀 Kafka producer started")

    return _producer


# ---------------- SAFE SEND (WITH RETRY) ----------------
async def send_event(topic: str, payload: dict):
    producer = await get_kafka_producer()

    for attempt in range(3):  # manual retry
        try:
            await producer.send_and_wait(topic, payload)
            logger.info(f"📤 Event sent | topic={topic} payload={payload}")
            return

        except Exception as e:
            logger.warning(f"⚠️ Kafka send failed (attempt {attempt+1})")

            if attempt == 2:
                logger.exception("❌ Kafka send permanently failed")
                raise

            await asyncio.sleep(1)


async def close_kafka_producer() -> None:
    global _producer

    if _producer is not None:
        await _producer.stop()
        _producer = None
        logger.info("🛑 Kafka producer stopped")