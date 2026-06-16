from sqlalchemy.orm import Session
from app.models.subscription import Subscription


def is_subscribed(db: Session, user_id: int, creator_id: int) -> bool:
    return db.query(Subscription).filter_by(
        user_id=user_id,
        creator_id=creator_id
    ).first() is not None
