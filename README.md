# Video Streaming Platform

A full-stack video streaming project that combines creator channel management, live WebRTC streaming, and video-on-demand processing.

## Current Project Status

- Live streaming is implemented using LiveKit and a WebRTC-based publisher/viewer flow.
- The frontend is a React + Vite application with creator studio, live watch pages, subscriptions, comments, and admin views.
- The backend is built with FastAPI, async SQLAlchemy, PostgreSQL, Redis, Kafka, and LiveKit integration.
- Video upload processing uses a separate FFmpeg worker service that consumes Kafka events and prepares assets for storage.
- AWS S3 and CloudFront integration is configured in the backend, although local development can run without a full AWS deployment.
- Docker Compose orchestrates the local development stack.

## Features Implemented

- JWT authentication and user registration
- Email verification on signup
- Creator onboarding and channel management
- Video upload and metadata management
- Live session creation, start/end, and viewer token generation
- WebRTC live streaming through LiveKit
- Viewer join flow and room discovery APIs
- Subscriptions and comments on videos
- Admin routes for users, videos, comments, reports, and creator requests
- Background VOD processing via Kafka + FFmpeg worker
- Redis for live session state, counters, and caching
- HLS playback support in the frontend with `hls.js` and `video.js`

## Project Architecture

### Frontend
- React + Vite SPA
- LiveKit client support via `livekit-client`
- Material UI for interface components
- Routing for creator studio, live pages, channels, subscriptions, and admin pages
- HTTP API integration via Axios

### Backend
- FastAPI application entrypoint at `backend/app/main.py`
- REST endpoints under `backend/app/routes/`
- GraphQL schema in `backend/app/graphql/schema.py`
- Database models in `backend/app/models/`
- Pydantic schemas in `backend/app/schemas/`
- Services for email, notifications, subscriptions, live presence, and video assets
- Kafka producer/consumer support in `backend/app/kafka/`
- Redis utilities in `backend/app/redis/`

### Media Processing
- LiveKit server for real-time video rooms
- LiveKit token generation and room control APIs in the backend
- `backend/ffmpeg_service/` worker for video processing and encoding
- AWS S3 helpers for upload/storage and CloudFront signed URLs

## Infrastructure

The stack is assembled via `docker-compose.yml` and includes:
- `frontend`
- `api`
- `postgres`
- `redis`
- `zookeeper`
- `kafka`
- `livekit`
- `ffmpeg`

LiveKit runtime configuration is managed in `infra/livekit/livekit.runtime.yaml` and can be started via scripts in `scripts/`.

## Running the Project

From the repository root:

```bash
docker compose up --build
```

For Windows development, use the LiveKit launcher:

```powershell
./scripts/start-livekit.ps1
```

For WSL development:

```bash
chmod +x ./scripts/start-livekit-wsl.sh
./scripts/start-livekit-wsl.sh
```

## Important URLs

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Health check: `http://localhost:8000/health`
- LiveKit signaling: `ws://localhost:7880`

## Notes for Current Status

- The active live workflow is WebRTC-only; RTMP streaming is not used.
- LiveKit must run with a reachable host/IP in local development for viewers to connect reliably.
- The backend supports S3/CloudFront configuration, but production deployment requires valid AWS credentials and asset storage setup.
- Kafka is configured for a single broker local dev environment; production should use a managed or clustered streaming service.

## Known Dependencies

Backend dependencies are listed in `backend/requirements.txt`.
Frontend dependencies are listed in `frontend/package.json`.

## Deployment Guidance

For a production-ready deployment, the current architecture assumes:
- Publicly reachable LiveKit server with proper UDP/TCP port exposure
- Managed PostgreSQL, Redis, and Kafka services
- AWS S3 for video and thumbnail storage
- CloudFront for asset delivery
- Secure environment variable management for JWT, SMTP, AWS, and LiveKit secrets

## Recommended Next Steps

- Finalize AWS S3 / CloudFront environment and secrets
- Harden authentication and API access controls
- Add production-grade monitoring for LiveKit and backend services
- Validate cross-device live streaming and browser compatibility
- Add automated tests for critical backend and frontend flows

