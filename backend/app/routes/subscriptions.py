from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.creator import Creator
from app.models.live_session import LiveSession, LiveSessionStatus
from app.models.premiere_session import PremiereSession, PremiereSessionStatus
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.subscription import SubscriptionChannelResponse
from app.services.email_service import send_email

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


@router.post("/{creator_id}")
async def subscribe(
    creator_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = int(user["sub"])
    creator = await db.get(Creator, creator_id)
    if not creator:
        raise HTTPException(404, "Creator not found")

    if creator.user_id == user_id:
        raise HTTPException(400, "Cannot subscribe to yourself")

    exists = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.creator_id == creator_id,
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(400, "Already subscribed")

    db.add(Subscription(user_id=user_id, creator_id=creator_id))
    creator.subscribers_count += 1
    await db.commit()

    subscriber = await db.get(User, user_id)
    creator_user = await db.get(User, creator.user_id)

    if subscriber and creator_user:
        await send_email(
            to_email=subscriber.email,
            subject=f"Subscribed to {creator.channel_name}",
            body=(
                f"Hello,\n\n"
                f"You have successfully subscribed to {creator.channel_name}.\n"
                "You will now receive creator updates in the platform."
            ),
        )
        await send_email(
            to_email=creator_user.email,
            subject="New subscriber on your channel",
            body=(
                f"Hello,\n\n"
                f"{subscriber.email} just subscribed to your channel "
                f"'{creator.channel_name}'."
            ),
        )

    return {"detail": "Subscribed"}


@router.delete("/{creator_id}")
async def unsubscribe(
    creator_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = int(user["sub"])
    res = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.creator_id == creator_id,
        )
    )
    subscription = res.scalar_one_or_none()
    if not subscription:
        raise HTTPException(404, "Not subscribed")

    creator = await db.get(Creator, creator_id)
    await db.execute(delete(Subscription).where(Subscription.id == subscription.id))

    if creator and creator.subscribers_count > 0:
        creator.subscribers_count -= 1

    await db.commit()
    return {"detail": "Unsubscribed"}


@router.get("/me", response_model=list[SubscriptionChannelResponse])
async def my_subscriptions(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription, Creator)
        .join(Creator, Creator.id == Subscription.creator_id)
        .where(Subscription.user_id == int(user["sub"]))
        .order_by(Creator.channel_name.asc())
    )
    subscriptions = result.all()

    channel_rows: list[SubscriptionChannelResponse] = []
    for subscription, creator in subscriptions:
        live_session = await db.scalar(
            select(LiveSession)
            .where(
                LiveSession.creator_id == creator.id,
                LiveSession.status == LiveSessionStatus.LIVE,
            )
            .order_by(LiveSession.id.desc())
            .limit(1)
        )
        premiere_session = await db.scalar(
            select(PremiereSession)
            .where(
                PremiereSession.creator_id == creator.id,
                PremiereSession.status.in_(
                    [PremiereSessionStatus.SCHEDULED, PremiereSessionStatus.LIVE]
                ),
            )
            .order_by(PremiereSession.scheduled_start_at.desc(), PremiereSession.id.desc())
            .limit(1)
        )
        is_live = live_session is not None or premiere_session is not None

        channel_rows.append(
            SubscriptionChannelResponse(
                creator_id=creator.id,
                channel_name=creator.channel_name,
                description=creator.description or "",
                subscribers_count=creator.subscribers_count,
                is_live=is_live,
                is_premiere=bool(
                    premiere_session
                    and premiere_session.status in (
                        PremiereSessionStatus.SCHEDULED,
                        PremiereSessionStatus.LIVE,
                    )
                ),
                channel_url=f"/channel/{creator.id}",
                live_url=f"/live/{creator.id}" if is_live else None,
            )
        )

    return channel_rows


@router.get("/creator/{creator_id}")
async def creator_subscription_status(
    creator_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == int(user["sub"]),
            Subscription.creator_id == creator_id,
        )
    )
    return {"subscribed": result.scalar_one_or_none() is not None}
