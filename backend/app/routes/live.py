import secrets
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user_optional
from app.dependencies.role import require_role
from app.kafka.producer import send_event
from app.kafka.topics import LIVE_ENDED, LIVE_STARTED
from app.models.creator import Creator
from app.models.live_session import LiveSession, LiveSessionStatus
from app.models.premiere_session import PremiereSession, PremiereSessionStatus
from app.models.video import Video, VideoStatus
from app.redis.client import redis_client
from app.schemas.live import LiveSessionUpsert, PremiereScheduleRequest, ViewerTokenRequest
from app.services.livekit_service import (
    build_participant_identity,
    build_room_name,
    create_livekit_token,
)

router = APIRouter(prefix="/live", tags=["Live"])
LOCALHOST_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _format_url_host(hostname: str) -> str:
    if ":" in hostname and not hostname.startswith("["):
        return f"[{hostname}]"
    return hostname


def _resolve_livekit_url(request: Request) -> str:
    configured_url = settings.livekit_public_url or settings.livekit_url
    if settings.livekit_public_url:
        return configured_url

    parsed = urlsplit(configured_url)
    if parsed.hostname not in LOCALHOST_HOSTS:
        return configured_url

    request_host = request.url.hostname
    if not request_host or request_host in LOCALHOST_HOSTS:
        return configured_url

    scheme = "wss" if request.url.scheme == "https" else (parsed.scheme or "ws")
    host = _format_url_host(request_host)
    netloc = f"{host}:{parsed.port}" if parsed.port else host
    return urlunsplit((scheme, netloc, parsed.path, parsed.query, parsed.fragment))


def _serialize_session(session: LiveSession | None) -> dict | None:
    if session is None:
        return None

    return {
        "id": session.id,
        "creator_id": session.creator_id,
        "room_name": session.room_name,
        "title": session.title,
        "description": session.description,
        "status": session.status.value,
        "viewer_count": session.viewer_count,
        "recording_enabled": session.recording_enabled,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
    }


def _build_video_playback_url(video_id: int) -> str | None:
    if not settings.cloudfront_domain:
        return None
    return f"https://{settings.cloudfront_domain}/videos/hls/{video_id}/master.m3u8"


def _get_effective_premiere_status(
    premiere: PremiereSession,
    now: datetime | None = None,
) -> PremiereSessionStatus:
    current_time = now or _utcnow()
    if premiere.status == PremiereSessionStatus.SCHEDULED and premiere.scheduled_start_at <= current_time:
        return PremiereSessionStatus.LIVE
    return premiere.status


def _serialize_premiere(
    premiere: PremiereSession | None,
    now: datetime | None = None,
) -> dict | None:
    if premiere is None:
        return None

    effective_status = _get_effective_premiere_status(premiere, now)
    return {
        "id": premiere.id,
        "creator_id": premiere.creator_id,
        "video_id": premiere.video_id,
        "title": premiere.title,
        "description": premiere.description,
        "status": effective_status.value,
        "scheduled_start_at": premiere.scheduled_start_at.isoformat(),
        "created_at": premiere.created_at.isoformat() if premiere.created_at else None,
        "ended_at": premiere.ended_at.isoformat() if premiere.ended_at else None,
        "live": effective_status == PremiereSessionStatus.LIVE,
        "upcoming": effective_status == PremiereSessionStatus.SCHEDULED,
        "playback_url": _build_video_playback_url(premiere.video_id),
    }


async def _get_creator_by_user_id(db: AsyncSession, user_id: int) -> Creator | None:
    result = await db.execute(select(Creator).where(Creator.user_id == user_id))
    return result.scalar_one_or_none()


async def _get_creator_by_id(db: AsyncSession, creator_id: int) -> Creator | None:
    result = await db.execute(select(Creator).where(Creator.id == creator_id))
    return result.scalar_one_or_none()


async def _get_latest_session_for_creator(
    db: AsyncSession,
    creator_id: int,
) -> LiveSession | None:
    result = await db.execute(
        select(LiveSession)
        .where(LiveSession.creator_id == creator_id)
        .order_by(LiveSession.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_session_by_room_name(
    db: AsyncSession,
    room_name: str,
) -> LiveSession | None:
    result = await db.execute(select(LiveSession).where(LiveSession.room_name == room_name))
    return result.scalar_one_or_none()


async def _get_video_for_creator(
    db: AsyncSession,
    creator_id: int,
    video_id: int,
) -> Video | None:
    result = await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.creator_id == creator_id,
        )
    )
    return result.scalar_one_or_none()


async def _get_latest_active_premiere_for_creator(
    db: AsyncSession,
    creator_id: int,
) -> PremiereSession | None:
    result = await db.execute(
        select(PremiereSession)
        .where(
            PremiereSession.creator_id == creator_id,
            PremiereSession.status.in_(
                [PremiereSessionStatus.SCHEDULED, PremiereSessionStatus.LIVE]
            ),
        )
        .order_by(PremiereSession.scheduled_start_at.desc(), PremiereSession.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _ensure_live_session(
    db: AsyncSession,
    creator: Creator,
    payload: LiveSessionUpsert | None = None,
) -> LiveSession:
    session = await _get_latest_session_for_creator(db, creator.id)
    room_name = build_room_name(creator.id)

    # Reuse the creator's stable room row instead of inserting duplicates
    # for the same room name after a stream ends.
    if session is None:
        session = await _get_session_by_room_name(db, room_name)

    if session is None:
        session = LiveSession(
            creator_id=creator.id,
            room_name=room_name,
            title=(payload.title if payload else f"{creator.channel_name} live"),
            description=payload.description if payload else "",
            status=LiveSessionStatus.IDLE,
            recording_enabled=payload.recording_enabled if payload else False,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session

    session.room_name = room_name
    session.creator_id = creator.id
    if payload is not None:
        session.title = payload.title
        session.description = payload.description
        session.recording_enabled = payload.recording_enabled
        if session.status in (LiveSessionStatus.IDLE, LiveSessionStatus.ENDED):
            session.status = LiveSessionStatus.STARTING
            session.started_at = _utcnow()
            session.ended_at = None
            session.viewer_count = 0

    await db.commit()
    await db.refresh(session)
    return session


@router.post("/session")
async def create_or_update_live_session(
    payload: LiveSessionUpsert,
    request: Request,
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    session = await _ensure_live_session(db, creator, payload)
    return {
        "session": _serialize_session(session),
        "livekit": {
            "url": _resolve_livekit_url(request),
            "room_name": session.room_name,
        },
    }


@router.get("/session/me")
async def get_my_live_session(
    request: Request,
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    session = await _get_latest_session_for_creator(db, creator.id)
    return {
        "creator_id": creator.id,
        "session": _serialize_session(session),
        "livekit": {
            "url": _resolve_livekit_url(request),
            "room_name": build_room_name(creator.id),
        },
    }


@router.post("/session/start")
async def start_live_session(
    payload: LiveSessionUpsert,
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    session = await _ensure_live_session(db, creator, payload)
    session.status = LiveSessionStatus.LIVE
    session.started_at = session.started_at or _utcnow()
    session.ended_at = None
    await db.commit()
    await db.refresh(session)

    await redis_client.set(f"live:{creator.id}:status", "LIVE", ex=3600)
    await send_event(
        LIVE_STARTED,
        {"creator_id": creator.id, "room_name": session.room_name},
    )

    return {"session": _serialize_session(session)}


@router.post("/premiere")
async def schedule_premiere_session(
    payload: PremiereScheduleRequest,
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    scheduled_start_at = payload.scheduled_start_at
    if scheduled_start_at.tzinfo is None:
        scheduled_start_at = scheduled_start_at.replace(tzinfo=timezone.utc)
    else:
        scheduled_start_at = scheduled_start_at.astimezone(timezone.utc)

    if scheduled_start_at <= _utcnow():
        raise HTTPException(400, "Scheduled start time must be in the future")

    video = await _get_video_for_creator(db, creator.id, payload.video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if video.status != VideoStatus.READY:
        raise HTTPException(400, "Only processed videos can be scheduled")

    premiere = await _get_latest_active_premiere_for_creator(db, creator.id)
    if premiere is None:
        premiere = PremiereSession(
            creator_id=creator.id,
            video_id=video.id,
            title=(payload.title or video.title).strip(),
            description=(payload.description if payload.description is not None else video.description or "").strip(),
            scheduled_start_at=scheduled_start_at,
            status=PremiereSessionStatus.SCHEDULED,
        )
        db.add(premiere)
    else:
        premiere.video_id = video.id
        premiere.title = (payload.title or video.title).strip()
        premiere.description = (
            payload.description if payload.description is not None else video.description or ""
        ).strip()
        premiere.scheduled_start_at = scheduled_start_at
        premiere.status = PremiereSessionStatus.SCHEDULED
        premiere.ended_at = None

    await db.commit()
    await db.refresh(premiere)

    return {"premiere": _serialize_premiere(premiere)}


@router.get("/premiere/me")
async def get_my_premiere_session(
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    premiere = await _get_latest_active_premiere_for_creator(db, creator.id)
    return {"creator_id": creator.id, "premiere": _serialize_premiere(premiere)}


@router.post("/premiere/{premiere_id}/cancel")
async def cancel_premiere_session(
    premiere_id: int,
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    premiere = await db.get(PremiereSession, premiere_id)
    if not premiere or premiere.creator_id != creator.id:
        raise HTTPException(404, "Premiere not found")

    premiere.status = PremiereSessionStatus.CANCELLED
    premiere.ended_at = _utcnow()
    await db.commit()
    await db.refresh(premiere)
    return {"premiere": _serialize_premiere(premiere)}


@router.post("/premiere/{premiere_id}/end")
async def end_premiere_session(
    premiere_id: int,
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    premiere = await db.get(PremiereSession, premiere_id)
    if not premiere or premiere.creator_id != creator.id:
        raise HTTPException(404, "Premiere not found")

    effective_status = _get_effective_premiere_status(premiere)
    if effective_status not in (
        PremiereSessionStatus.SCHEDULED,
        PremiereSessionStatus.LIVE,
    ):
        raise HTTPException(400, "Premiere is already finished")

    premiere.status = PremiereSessionStatus.ENDED
    premiere.ended_at = _utcnow()
    await db.commit()
    await db.refresh(premiere)
    return {"premiere": _serialize_premiere(premiere)}


@router.post("/session/end")
async def end_live_session(
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    session = await _get_latest_session_for_creator(db, creator.id)
    if session is None:
        raise HTTPException(404, "Live session not found")

    session.status = LiveSessionStatus.ENDED
    session.ended_at = _utcnow()
    await db.commit()
    await db.refresh(session)

    await redis_client.delete(f"live:{creator.id}:status")
    await send_event(LIVE_ENDED, {"creator_id": creator.id, "room_name": session.room_name})

    return {"session": _serialize_session(session)}


@router.post("/token/publisher")
async def issue_publisher_token(
    request: Request,
    creator_user=Depends(require_role("CREATOR")),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_user_id(db, int(creator_user["sub"]))
    if not creator:
        raise HTTPException(404, "Creator not found")

    session = await _ensure_live_session(db, creator)
    token = create_livekit_token(
        identity=build_participant_identity("creator", creator.id),
        room_name=session.room_name,
        can_publish=True,
        can_subscribe=True,
        room_admin=True,
        display_name=creator.channel_name,
        metadata=f'{{"creatorId": {creator.id}}}',
    )

    return {
        "token": token,
        "url": _resolve_livekit_url(request),
        "room_name": session.room_name,
        "session": _serialize_session(session),
    }


@router.post("/token/viewer")
async def issue_viewer_token(
    payload: ViewerTokenRequest,
    request: Request,
    user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_id(db, payload.creator_id)
    if not creator:
        raise HTTPException(404, "Creator not found")

    session = await _get_latest_session_for_creator(db, creator.id)
    if session is None or session.status != LiveSessionStatus.LIVE:
        raise HTTPException(404, "Creator not live")

    if user:
        identity = build_participant_identity("viewer", user["sub"])
        display_name = f"User {user['sub']}"
    else:
        identity = build_participant_identity("guest", secrets.token_hex(6))
        display_name = "Guest viewer"

    token = create_livekit_token(
        identity=identity,
        room_name=session.room_name,
        can_publish=False,
        can_subscribe=True,
        can_publish_data=False,
        display_name=display_name,
        metadata=f'{{"creatorId": {creator.id}}}',
        ttl_minutes=30,
    )

    return {
        "token": token,
        "url": _resolve_livekit_url(request),
        "room_name": session.room_name,
        "session": _serialize_session(session),
    }


@router.get("/{creator_id}/room")
async def get_live_room(
    creator_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    creator = await _get_creator_by_id(db, creator_id)
    if not creator:
        raise HTTPException(404, "Creator not found")

    session = await _get_latest_session_for_creator(db, creator_id)
    premiere = await _get_latest_active_premiere_for_creator(db, creator_id)
    serialized_premiere = _serialize_premiere(premiere)
    has_live_room = bool(session and session.status == LiveSessionStatus.LIVE)
    has_live_premiere = bool(serialized_premiere and serialized_premiere["live"])
    stream_type = "webrtc" if has_live_room else ("premiere" if serialized_premiere else None)
    return {
        "creator_id": creator.id,
        "channel_name": creator.channel_name,
        "description": creator.description,
        "room_name": build_room_name(creator.id),
        "live": has_live_room or has_live_premiere,
        "stream_type": stream_type,
        "session": _serialize_session(session),
        "premiere": serialized_premiere,
        "livekit_url": _resolve_livekit_url(request),
    }


@router.get("/{creator_id}/status")
async def live_status(
    creator_id: int,
    db: AsyncSession = Depends(get_db),
):
    session = await _get_latest_session_for_creator(db, creator_id)
    premiere = await _get_latest_active_premiere_for_creator(db, creator_id)
    is_live = bool(session and session.status == LiveSessionStatus.LIVE)
    if not is_live and premiere:
        is_live = _get_effective_premiere_status(premiere) == PremiereSessionStatus.LIVE

    if is_live:
        await redis_client.set(f"live:{creator_id}:status", "LIVE", ex=60)
    else:
        await redis_client.delete(f"live:{creator_id}:status")

    return {"live": is_live}
