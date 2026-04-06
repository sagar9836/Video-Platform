# app/routes/admin_reports.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.dependencies.role import require_role
from app.models.video_analytics import VideoAnalytics

router = APIRouter(prefix="/admin/reports", tags=["Admin Reports"])


@router.get("/summary")
async def reports_summary(
    admin=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            func.sum(VideoAnalytics.views),
            func.sum(VideoAnalytics.likes),
        )
    )
    views, likes = result.one()

    return {
        "total_views": views or 0,
        "total_likes": likes or 0,
    }
