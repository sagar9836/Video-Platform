# app/routes/admin_comments.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.dependencies.role import require_role
from app.models.comment import Comment

router = APIRouter(prefix="/admin/comments", tags=["Admin Comments"])


@router.get("")
async def list_comments(
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Comment).order_by(Comment.created_at.desc())
    )
    comments = result.scalars().all()

    return [
        {
            "id": c.id,
            "video_id": c.video_id,
            "user_id": c.user_id,
            "content": c.content,
            "created_at": c.created_at,
        }
        for c in comments
    ]


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(404, "Comment not found")

    await db.delete(comment)
    await db.commit()

    return {"detail": "Comment deleted"}
