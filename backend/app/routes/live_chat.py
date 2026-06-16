import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.live_chat import connect, disconnect, publish_message

router = APIRouter(prefix="/live/chat")


@router.websocket("/{room_name}")
async def chat_ws(websocket: WebSocket, room_name: str):
    await connect(room_name, websocket)

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            await publish_message(room_name, payload)

    except WebSocketDisconnect:
        disconnect(room_name, websocket)

    except Exception:
        disconnect(room_name, websocket)