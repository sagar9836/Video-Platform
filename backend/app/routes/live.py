import uuid
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.creator import Creator
from app.models.live_session import LiveSession, LiveSessionStatus
from app.models.premiere_session import PremiereSession, PremiereSessionStatus
from app.models.video import Video
from app.schemas.live import LiveSessionUpsert, ViewerTokenRequest
from app.services.livekit_service import create_egress_token, create_token
from app.services.video_assets import build_video_play_url, build_video_thumbnail_url
from app.kafka.producer import send_event
from app.kafka.topics import LIVE_ENDED
from app.services.live_presence import get_count

router = APIRouter(prefix="/live", tags=["Live"])
logger = logging.getLogger(__name__)


# ------------------------
# Utils
# ------------------------

def _utcnow():
    return datetime.now(timezone.utc)


# ------------------------
# LiveKit Egress (Recording)
# ------------------------

async def start_egress(room_name: str):
    token = create_egress_token()

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://livekit:7880/twirp/livekit.Egress/StartRoomCompositeEgress",
                json={
                    "room_name": room_name,
                    "layout": "grid",
                    "preset": "H264_720P_30",
                    "file_outputs": [
                        {
                            "filepath": f"/tmp/{room_name}.mp4"
                        }
                    ]
                },
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.exception("LiveKit egress rejected the recording request")
            raise HTTPException(
                502,
                f"Egress failed: {e.response.text[:300]}",
            ) from e
        except Exception as e:
            logger.exception("Unable to start LiveKit egress")
            raise HTTPException(502, "Unable to start recording") from e


# ------------------------
# DB Helpers
# ------------------------

async def _get_creator(db: AsyncSession, user_id: int):
    creator = await db.scalar(select(Creator).where(Creator.user_id == user_id))
    if not creator:
        raise HTTPException(403, "Creator access required")
    return creator


async def _get_active_live_session(db: AsyncSession, creator_id: int):
    return await db.scalar(
        select(LiveSession)
        .where(
            LiveSession.creator_id == creator_id,
            LiveSession.status == LiveSessionStatus.LIVE
        )
        .order_by(LiveSession.id.desc())
        .limit(1)
    )


async def _get_latest_live_session(db: AsyncSession, creator_id: int):
    return await db.scalar(
        select(LiveSession)
        .where(LiveSession.creator_id == creator_id)
        .order_by(LiveSession.id.desc())
        .limit(1)
    )


def _serialize_session(session: LiveSession):
    return {
        "id": session.id,
        "creator_id": session.creator_id,
        "title": session.title,
        "description": session.description,
        "status": session.status.value,
        "room_name": session.room_name,
        "recording_enabled": session.recording_enabled,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


# ------------------------
# Routes
# ------------------------

@router.post("/session/start")
async def start_live_session(
    payload: LiveSessionUpsert,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    session = await _get_active_live_session(db, creator.id)

    if session:
        session.title = payload.title
        session.description = payload.description
        await db.commit()
        await db.refresh(session)
        return {"session": _serialize_session(session)}

    session = LiveSession(
        creator_id=creator.id,
        title=payload.title,
        description=payload.description,
        room_name=f"live_{creator.id}_{uuid.uuid4().hex[:8]}",
        status=LiveSessionStatus.LIVE,
        started_at=_utcnow(),
    )

    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {"session": _serialize_session(session)}


@router.get("/session/me")
async def get_my_live_session(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    session = await _get_latest_live_session(db, creator.id)

    return {"session": _serialize_session(session) if session else None}


@router.post("/session")
async def upsert_live_session(
    payload: LiveSessionUpsert,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    session = await _get_latest_live_session(db, creator.id)

    if session and session.status != LiveSessionStatus.ENDED:
        session.title = payload.title
        session.description = payload.description
    else:
        session = LiveSession(
            creator_id=creator.id,
            title=payload.title,
            description=payload.description,
            room_name=f"live_{creator.id}_{uuid.uuid4().hex[:8]}",
            status=LiveSessionStatus.CREATED,
        )
        db.add(session)

    await db.commit()
    await db.refresh(session)

    return {"session": _serialize_session(session)}


@router.post("/session/recording/start")
async def start_live_recording(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    session = await _get_active_live_session(db, creator.id)

    if not session:
        raise HTTPException(404, "No active live session")

    if session.recording_enabled:
        return {"session": _serialize_session(session), "recording": "already_started"}

    egress = await start_egress(session.room_name)
    session.recording_enabled = True

    await db.commit()
    await db.refresh(session)

    return {
        "session": _serialize_session(session),
        "egress": egress,
    }


@router.post("/session/end")
async def end_live_session(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator(db, int(user["sub"]))
    session = await _get_active_live_session(db, creator.id)

    if not session:
        raise HTTPException(404, "No active live session")

    session.status = LiveSessionStatus.ENDED
    session.ended_at = _utcnow()

    await db.commit()

    # 🔥 Trigger processing
    await send_event(LIVE_ENDED, {
        "room_name": session.room_name,
        "creator_id": creator.id
    })

    return {"message": "Live ended", "session": _serialize_session(session)}


@router.post("/token/publisher")
async def publisher_token(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    creator = await _get_creator(db, int(user["sub"]))
    session = await _get_active_live_session(db, creator.id)

    if not session:
        raise HTTPException(400, "No live session")

    token = create_token(f"creator_{creator.id}", session.room_name, True)

    return {
        "token": token,
        "url": settings.livekit_public_url,
        "room_name": session.room_name,
        "session": _serialize_session(session),
    }


@router.post("/token/viewer")
async def viewer_token(payload: ViewerTokenRequest, db: AsyncSession = Depends(get_db)):
    session = await _get_active_live_session(db, payload.creator_id)

    if not session:
        raise HTTPException(404, "Creator not live")

    token = create_token(
        f"viewer_{uuid.uuid4().hex[:8]}",
        session.room_name,
        False,
    )

    return {
        "token": token,
        "url": settings.livekit_public_url,
        "room_name": session.room_name,
    }


@router.get("/{creator_id}/status")
async def status(creator_id: int, db: AsyncSession = Depends(get_db)):
    session = await _get_active_live_session(db, creator_id)

    if session:
        return {
            "mode": "live",
            "room_name": session.room_name,
            "title": session.title,
            "description": session.description,
            "session": _serialize_session(session),
            "join_url": settings.livekit_public_url,
        }

    return {"mode": "offline"}


@router.get("/viewers/{room_name}")
async def viewers(room_name: str):
    return {"count": await get_count(room_name)}
