import asyncio
import json
import logging
import socket
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any

from aiokafka import AIOKafkaConsumer
from fastapi import WebSocket

from app.core.config import settings
from app.kafka.producer import send_event
from app.kafka.topics import LIVE_CHAT_MESSAGE
from app.services.live_presence import increment, decrement

logger = logging.getLogger("live-chat")

MAX_MESSAGE_LENGTH = 400
MAX_RECENT_MESSAGES = 50

rooms: dict[str, set[WebSocket]] = defaultdict(set)
recent_messages: dict[str, deque] = defaultdict(lambda: deque(maxlen=MAX_RECENT_MESSAGES))


def _utcnow():
    return datetime.now(timezone.utc)


async def connect(room: str, websocket: WebSocket):
    await websocket.accept()
    rooms[room].add(websocket)

    # ✅ presence
    await increment(room)

    # send chat history
    await websocket.send_json({
        "type": "chat.history",
        "messages": list(recent_messages[room])
    })


def disconnect(room: str, websocket: WebSocket):
    rooms[room].discard(websocket)

    # ✅ presence
    asyncio.create_task(decrement(room))

    if not rooms[room]:
        rooms.pop(room, None)


async def publish_message(room: str, message: dict[str, Any]):
    text = str(message.get("text", "")).strip()
    if not text:
        return

    payload = {
        "id": uuid.uuid4().hex,
        "room_name": room,
        "text": text[:MAX_MESSAGE_LENGTH],
        "sent_at": _utcnow().isoformat(),
    }

    # send to Kafka
    await send_event(LIVE_CHAT_MESSAGE, payload, key=room)


async def _broadcast(payload: dict):
    room = payload["room_name"]

    recent_messages[room].append(payload)

    for ws in list(rooms.get(room, [])):
        try:
            await ws.send_json({
                "type": "chat.message",
                "message": payload
            })
        except Exception:
            disconnect(room, ws)


async def start_live_chat_consumer():
    consumer = AIOKafkaConsumer(
        LIVE_CHAT_MESSAGE,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_deserializer=lambda x: json.loads(x.decode()),
        group_id=f"chat-{socket.gethostname()}-{uuid.uuid4().hex[:6]}",
    )

    await consumer.start()

    try:
        async for msg in consumer:
            await _broadcast(msg.value)
    finally:
        await consumer.stop()