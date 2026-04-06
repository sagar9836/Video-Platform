from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.comment import Comment
from app.models.video import Video
from app.schemas.comment import CommentCreate
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/comments", tags=["Comments"])

@router.post("/videos/{video_id}")
async def add_comment(
    video_id: int,
    payload: CommentCreate,   # 👈 JSON BODY
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = int(user["sub"])
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    comment = Comment(
        video_id=video_id,
        user_id=user_id,
        content=payload.content.strip(),
    )

    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return {
        "id": comment.id,
        "content": comment.content,
        "created_at": comment.created_at,
        "user_id": user_id,
    }


@router.get("/videos/{video_id}")
async def list_comments(
    video_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Comment)
        .where(Comment.video_id == video_id)
        .order_by(Comment.created_at.desc())
    )

    comments = result.scalars().all()

    return [
        {
            "id": c.id,
            "content": c.content,
            "created_at": c.created_at,
            "user_id": c.user_id,
        }
        for c in comments
    ]
