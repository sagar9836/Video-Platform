import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from strawberry.fastapi import GraphQLRouter

from app.core.config import settings
from app.db.init_db import init_db
from app.graphql.schema import schema
from app.kafka.notification_consumer import start_notification_consumer
from app.kafka.producer import close_kafka_producer
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
)

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
)

notification_consumer_task: asyncio.Task | None = None

graphql_app = GraphQLRouter(schema)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    global notification_consumer_task

    await init_db()
    notification_consumer_task = asyncio.create_task(start_notification_consumer())


@app.on_event("shutdown")
async def shutdown_event():
    global notification_consumer_task

    if notification_consumer_task is not None:
        notification_consumer_task.cancel()
        try:
            await notification_consumer_task
        except asyncio.CancelledError:
            pass
        notification_consumer_task = None

    await close_kafka_producer()


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


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
