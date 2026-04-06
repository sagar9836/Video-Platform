# app/kafka/producer.py
import json
import logging
from aiokafka import AIOKafkaProducer
from app.core.config import settings

logger = logging.getLogger("kafka-producer")

_producer: AIOKafkaProducer | None = None


async def get_kafka_producer() -> AIOKafkaProducer:
    global _producer

    if _producer:
        return _producer

    _producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        acks="all",                 # 🔥 ensure durability
        linger_ms=5,                # 🔥 batch small bursts
        # retries=5,                  # 🔥 retry on transient failure
    )

    await _producer.start()
    logger.info("Kafka producer started")
    return _producer


async def send_event(topic: str, payload: dict):
    producer = await get_kafka_producer()

    try:
        await producer.send_and_wait(topic, payload)
        logger.info(f"📤 Kafka event sent | topic={topic} payload={payload}")
    except Exception as e:
        logger.error(f"❌ Kafka send failed | topic={topic}", exc_info=e)
        raise










# import json
# from typing import Optional

# from aiokafka import AIOKafkaProducer
# from app.core.config import settings

# _producer: Optional[AIOKafkaProducer] = None


# async def get_kafka_producer() -> AIOKafkaProducer:
#     """
#     Lazy, safe Kafka producer.

#     - Created only when first needed
#     - Reused across requests
#     - Does NOT auto-start on FastAPI startup
#     """
#     global _producer

#     if _producer is not None:
#         return _producer

#     if not settings.kafka_bootstrap_servers:
#         raise RuntimeError("KAFKA_BOOTSTRAP_SERVERS is not set")

#     producer = AIOKafkaProducer(
#         bootstrap_servers=settings.kafka_bootstrap_servers,
#         value_serializer=lambda v: json.dumps(v).encode("utf-8"),
#         acks="all",  # ✅ safer for event delivery
#     )

#     await producer.start()
#     _producer = producer
#     return _producer


async def close_kafka_producer() -> None:
    """
    Gracefully close Kafka producer on app shutdown.
    """
    global _producer

    if _producer is not None:
        await _producer.stop()
        _producer = None
