# Video Streaming Platform

Full-stack video streaming platform with:
- JWT auth
- creator onboarding
- presigned video uploads
- guest video preview
- live streaming with OBS + nginx-rtmp
- subscriptions, comments, analytics
- admin management pages

## Architecture

### Backend
- FastAPI app in [`backend/app/main.py`](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/app/main.py)
- Async SQLAlchemy + PostgreSQL with one `AsyncSession` per request via [`backend/app/db/session.py`](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/app/db/session.py)
- Redis for hot state like live status and counters
- Kafka for event-driven processing and notifications
- FFmpeg worker for VOD transcoding
- nginx-rtmp for RTMP ingest and HLS generation

### Frontend
- React + Vite app in [`frontend/src/app/App.jsx`](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/app/App.jsx)
- Material UI for UI components
- Creator control room and public live watch page for streaming

## Current System Design

### Database communication
- The backend uses async SQLAlchemy ORM.
- App settings load `DATABASE_URL` from [`backend/app/core/config.py`](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/app/core/config.py).
- The async engine and session factory are created in [`backend/app/db/session.py`](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/app/db/session.py).
- Route handlers receive a DB session through FastAPI dependency injection with `Depends(get_db)`.

### Live streaming flow
1. Creator gets or rotates a stream key through `POST /live/stream-key`.
2. OBS publishes to `rtmp://localhost:1935/stream`.
3. nginx-rtmp triggers `/live/start` and `/live/stop`.
4. nginx writes HLS output under `/opt/data/hls`.
5. Viewers use `GET /live/{creator_id}/play` to get the public HLS URL.

### Video upload flow
1. Creator requests a presigned upload URL with `POST /videos/upload`.
2. Client uploads the raw file directly to S3.
3. Client confirms with `POST /videos/{video_id}/complete`.
4. Kafka + FFmpeg worker process the video into HLS.
5. Ready videos are served through CloudFront.

## Features

### Viewer
- Browse public videos
- Watch guest preview before login
- View video details and comments
- Like videos
- Subscribe to creators
- Watch live streams from creator public pages

### Creator
- Become creator via email verification
- Receive initial RTMP stream key
- Upload videos
- Manage creator studio
- Rotate stream key
- Check live status
- Share a public live room URL

### Admin
- Platform dashboard
- Manage users
- Manage videos
- Manage comments
- See report summaries
- Legacy creator-request endpoints still exist because the frontend still references them

## Main API Areas

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password/request`
- `POST /auth/forgot-password/confirm`

### Creators
- `POST /creators/verify-email/request`
- `POST /creators/verify-email/confirm`
- `POST /creators/apply`
- `POST /creators`
- `GET /creators/me/videos`
- `GET /creators/{creator_id}`
- `GET /creators/{creator_id}/videos`

### Videos
- `POST /videos/upload`
- `POST /videos/{video_id}/complete`
- `GET /videos/{video_id}/status`
- `GET /videos/{video_id}/play`
- `GET /videos/{video_id}`
- `GET /videos/`

### Engagement
- `POST /analytics/videos/{video_id}/view`
- `POST /analytics/videos/{video_id}/watch`
- `POST /analytics/videos/{video_id}/like`
- `GET /analytics/videos/{video_id}/stats`
- `POST /comments/videos/{video_id}`
- `GET /comments/videos/{video_id}`
- `POST /subscriptions/{creator_id}`
- `DELETE /subscriptions/{creator_id}`
- `GET /subscriptions/me`
- `GET /subscriptions/creator/{creator_id}`

### Live
- `POST /live/stream-key`
- `POST /live/start`
- `POST /live/stop`
- `GET /live/{creator_id}/status`
- `GET /live/{creator_id}/play`

## Project Structure

```text
Video-Platform/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   ├── db/
│   │   ├── dependencies/
│   │   ├── kafka/
│   │   ├── models/
│   │   ├── redis/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── utils/
│   │   └── main.py
│   ├── ffmpeg_service/
│   ├── nginx/
│   ├── docker-compose.yml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── app/
│   │   ├── auth/
│   │   ├── components/
│   │   ├── layouts/
│   │   └── pages/
│   └── package.json
└── README.md
```

## Local Development

### Prerequisites
- Docker
- Node.js + npm
- AWS credentials for real S3/CloudFront usage
- SMTP credentials if you want real email delivery

### Environment setup
Create `backend/.env` with at least:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/video_platform
JWT_SECRET=your-secret
REDIS_URL=redis://redis:6379/0
KAFKA_BOOTSTRAP_SERVERS=kafka:29092
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
S3_BUCKET=...
CLOUDFRONT_DOMAIN=...
CLOUDFRONT_KEY_PAIR_ID=...
CLOUDFRONT_PRIVATE_KEY_PATH=/app/keys/cloudfront_rsa.pem
DEBUG=true
```

### Run the full stack

Recommended from the project root:

```bash
docker compose up --build
```

Services started:
- `frontend`
- `api`
- `postgres`
- `redis`
- `zookeeper`
- `kafka`
- `ffmpeg`
- `nginx-rtmp`

Main URLs:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Health check: `http://localhost:8000/health`
- Live HLS: `http://localhost:8081/live`
- RTMP ingest: `rtmp://localhost:1935/stream`

You can also run the same full stack from [`backend/docker-compose.yml`](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/docker-compose.yml), but the root [`docker-compose.yml`](/c:/Users/sagar/Desktop/docker/Video-Platform/docker-compose.yml) is the main entry point.

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

## Key Frontend Pages

- Creator studio: [`frontend/src/pages/creator/CreatorStudio.jsx`](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/pages/creator/CreatorStudio.jsx)
- Public live watch page: [`frontend/src/pages/live/LiveWatch.jsx`](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/pages/live/LiveWatch.jsx)
- Public channel page: [`frontend/src/pages/channel/ChannelPage.jsx`](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/pages/channel/ChannelPage.jsx)
- Video player: [`frontend/src/pages/video/VideoPlayer.jsx`](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/pages/video/VideoPlayer.jsx)

## Notes

- The project now uses the cleaned backend route set from [`backend/app/routes`](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/app/routes).
- Old duplicate live-stream route files and unused backend stubs were removed.
- The backend compiles after cleanup, but full runtime still depends on installed services and valid environment configuration.
- Admin creator-request endpoints still exist for frontend compatibility, even though creator onboarding is primarily self-serve through email verification.

## Scalability Summary

This architecture is a solid base for small-to-medium scale:
- stateless FastAPI API
- async DB sessions
- PostgreSQL
- Redis
- Kafka
- separate FFmpeg worker
- separate nginx live ingest layer

It is not fully production-scaled yet because:
- some business logic is still route-heavy
- live HLS storage is local-volume based in Docker
- monitoring, rate limiting, retry policies, and pool tuning are still minimal

## License

No license file is currently present in the repository.
