from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.role import require_role
from app.kafka.producer import send_event
from app.kafka.topics import LIVE_ENDED, LIVE_STARTED
from app.models.creator import Creator
from app.redis.client import redis_client
from app.services.stream_key import generate_stream_key, validate_stream_key

router = APIRouter(prefix="/live", tags=["Live"])


async def _extract_stream_key(request: Request) -> str | None:
    stream_key = request.query_params.get("name")
    if stream_key:
        return stream_key.strip()

    body = await request.body()
    if not body:
        return None

    parsed = parse_qs(body.decode("utf-8"), keep_blank_values=False)
    values = parsed.get("name")
    if not values:
        return None

    return values[0].strip()


@router.post("/stream-key")
async def issue_stream_key(
    creator=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    user_id = int(creator["sub"])

    result = await db.execute(select(Creator).where(Creator.user_id == user_id))
    creator_obj = result.scalar_one_or_none()
    if not creator_obj:
        raise HTTPException(404, "Creator not found")

    stream_key = generate_stream_key(user_id)
    creator_obj.stream_key = stream_key
    await db.commit()

    return {
        "rtmp_url": settings.live_rtmp_url,
        "stream_key": stream_key,
    }


@router.get("/setup")
async def get_live_setup(
    creator=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    user_id = int(creator["sub"])

    result = await db.execute(select(Creator).where(Creator.user_id == user_id))
    creator_obj = result.scalar_one_or_none()
    if not creator_obj:
        raise HTTPException(404, "Creator not found")

    if not creator_obj.stream_key:
        creator_obj.stream_key = generate_stream_key(user_id)
        await db.commit()

    live_state = await redis_client.get(f"live:{creator_obj.id}:status")

    return {
        "creator_id": creator_obj.id,
        "rtmp_url": settings.live_rtmp_url,
        "stream_key": creator_obj.stream_key,
        "live": live_state == "LIVE",
        "playback_url": (
            f"{settings.live_hls_base_url}/{creator_obj.stream_key}/index.m3u8"
            if live_state == "LIVE"
            else None
        ),
    }


@router.post("/start")
async def live_start(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    stream_key = await _extract_stream_key(request)
    if not stream_key:
        raise HTTPException(status_code=400, detail="Missing stream key")

    stream_user_id = validate_stream_key(stream_key)
    if not stream_user_id:
        raise HTTPException(
            status_code=403,
            detail=(
                "Invalid stream key format. Use the key from "
                "/live/stream-key or /creators/verify-email/confirm"
            ),
        )

    result = await db.execute(select(Creator).where(Creator.stream_key == stream_key))
    creator = result.scalar_one_or_none()
    if not creator or creator.user_id != stream_user_id:
        raise HTTPException(status_code=403, detail="Unknown stream key")

    await redis_client.set(f"live:{creator.id}:status", "LIVE")
    await send_event(LIVE_STARTED, {"creator_id": creator.id})

    return {"status": "ok", "creator_id": creator.id}


@router.post("/stop")
async def live_stop(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    stream_key = await _extract_stream_key(request)
    if not stream_key:
        return {"status": "ignored"}

    result = await db.execute(select(Creator).where(Creator.stream_key == stream_key))
    creator = result.scalar_one_or_none()
    if not creator:
        return {"status": "ignored"}

    await redis_client.delete(f"live:{creator.id}:status")
    await send_event(LIVE_ENDED, {"creator_id": creator.id})

    return {"status": "stopped", "creator_id": creator.id}


@router.get("/{creator_id}/status")
async def live_status(creator_id: int):
    live_state = await redis_client.get(f"live:{creator_id}:status")
    return {"live": live_state == "LIVE"}


@router.get("/{creator_id}/play")
async def play_live(
    creator_id: int,
    db: AsyncSession = Depends(get_db),
):
    status = await redis_client.get(f"live:{creator_id}:status")
    if status != "LIVE":
        raise HTTPException(status_code=404, detail="Creator not live")

    result = await db.execute(select(Creator).where(Creator.id == creator_id))
    creator = result.scalar_one_or_none()
    if not creator or not creator.stream_key:
        raise HTTPException(status_code=404, detail="Live stream not found")

    return {
        "hls_url": f"{settings.live_hls_base_url}/{creator.stream_key}/index.m3u8"
    }
