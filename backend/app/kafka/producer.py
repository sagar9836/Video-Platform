# app/kafka/producer.py

import json
import logging
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
        acks="all",          # ✅ durability
        linger_ms=5,         # ✅ batching
        retries=3,           # ✅ transient retry
    )

    await _producer.start()
    logger.info("🚀 Kafka producer started")

    return _producer


async def send_event(topic: str, payload: dict):
    producer = await get_kafka_producer()

    try:
        await producer.send_and_wait(topic, payload)
        logger.info(f"📤 Event sent | topic={topic} payload={payload}")
    except Exception:
        logger.exception(f"❌ Kafka send failed | topic={topic}")
        raise


async def close_kafka_producer() -> None:
    global _producer

    if _producer is not None:
        await _producer.stop()
        _producer = None
        logger.info("🛑 Kafka producer stopped")