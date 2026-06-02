import asyncio
import logging
import mimetypes

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from strawberry.fastapi import GraphQLRouter

from app.core.config import settings
from app.db.init_db import init_db
from app.graphql.schema import schema
from app.kafka.notification_consumer import start_notification_consumer
from app.kafka.producer import close_kafka_producer
from app.services.live_chat import start_live_chat_consumer
from app.routes import (
    admin,
    admin_comments,
    admin_reports,
    admin_users,
    admin_videos,
    analytics,
    auth,
    comments,
    creators,
    live,
    subscriptions,
    users,
    videos,
    live_chat,
)
from app.services.storage import get_local_media_root, is_local_storage

logger = logging.getLogger("app")

mimetypes.add_type("application/vnd.apple.mpegurl", ".m3u8")
mimetypes.add_type("video/MP2T", ".ts")

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
)

notification_consumer_task: asyncio.Task | None = None
live_chat_consumer_task: asyncio.Task | None = None

graphql_app = GraphQLRouter(schema)
allow_all_origins = "*" in settings.cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

if is_local_storage():
    app.mount("/media", StaticFiles(directory=get_local_media_root()), name="media")


@app.on_event("startup")
async def startup_event():
    global notification_consumer_task, live_chat_consumer_task

    logger.info("🚀 Starting application...")

    await init_db()

    # 🔥 Start Kafka consumers safely
    try:
        notification_consumer_task = asyncio.create_task(
            start_notification_consumer()
        )
        live_chat_consumer_task = asyncio.create_task(
            start_live_chat_consumer()
        )

        logger.info("✅ Background consumers started")

    except Exception as e:
        logger.exception("❌ Failed to start background consumers")


@app.on_event("shutdown")
async def shutdown_event():
    global notification_consumer_task, live_chat_consumer_task

    logger.info("🛑 Shutting down application...")

    for task in [notification_consumer_task, live_chat_consumer_task]:
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    await close_kafka_producer()

    logger.info("✅ Shutdown complete")


# ---------------- ROUTES ----------------

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(creators.router)
app.include_router(videos.router)
app.include_router(subscriptions.router)
app.include_router(live.router)
app.include_router(admin.router)
app.include_router(analytics.router)
app.include_router(comments.router)
app.include_router(admin_comments.router)
app.include_router(admin_users.router)
app.include_router(admin_reports.router)
app.include_router(admin_videos.router)
app.include_router(graphql_app, prefix="/graphql")
app.include_router(live_chat.router)


# ---------------- HEALTH ----------------

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
