from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from datetime import datetime

from app.db.session import get_db
from app.models.live_session import LiveSession
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/live", tags=["Live"])


@router.post("/session/start")
async def start_live_session(
    title: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creator_id = int(user["sub"])

    room_name = f"live_{creator_id}_{uuid.uuid4().hex[:6]}"

    session = LiveSession(
        creator_id=creator_id,
        title=title,
        room_name=room_name,
        status="LIVE",
        started_at=datetime.utcnow(),
    )

    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "session_id": session.id,
        "room_name": room_name,
    }

@router.post("/session/end")
async def end_live_session(
    session_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(LiveSession, session_id)

    if not session:
        raise HTTPException(404, "Session not found")

    session.status = "ENDED"
    session.ended_at = datetime.utcnow()

    await db.commit()

    return {"message": "Live ended"}


@router.get("/{creator_id}/status")
async def get_live_status(
    creator_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LiveSession)
        .where(LiveSession.creator_id == creator_id)
        .where(LiveSession.status == "LIVE")
    )

    session = result.scalar_one_or_none()

    if not session:
        return {"is_live": False}

    return {
        "is_live": True,
        "room_name": session.room_name,
        "title": session.title,
    }