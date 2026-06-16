# Video Streaming Platform

Full-stack video platform with:
- JWT authentication
- email verification during registration
- creator onboarding and channel setup
- direct video uploads and VOD processing
- subscriptions, comments, analytics, and admin flows
- browser-based live streaming over WebRTC with LiveKit

## Stack

### Backend
- FastAPI app in [backend/app/main.py](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/app/main.py)
- async SQLAlchemy + PostgreSQL
- Redis for short-lived live status and counters
- Kafka + FFmpeg worker for VOD processing
- Live session APIs in [backend/app/routes/live.py](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/app/routes/live.py)

### Frontend
- React + Vite app in [frontend/src/app/App.jsx](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/app/App.jsx)
- shared app shell + navbar in [frontend/src/components/layout/Navbar.jsx](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/components/layout/Navbar.jsx)
- creator live studio in [frontend/src/pages/creator/LiveControl.jsx](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/pages/creator/LiveControl.jsx)
- public live watch page in [frontend/src/pages/live/LiveWatch.jsx](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/pages/live/LiveWatch.jsx)
- subscribed channels page in [frontend/src/pages/Subscriptions.jsx](/c:/Users/sagar/Desktop/docker/Video-Platform/frontend/src/pages/Subscriptions.jsx)

### Infrastructure
- Docker Compose stack in [docker-compose.yml](/c:/Users/sagar/Desktop/docker/Video-Platform/docker-compose.yml)
- LiveKit base config in [infra/livekit/livekit.yaml](/c:/Users/sagar/Desktop/docker/Video-Platform/infra/livekit/livekit.yaml)
- Windows LiveKit launcher in [scripts/start-livekit.ps1](/c:/Users/sagar/Desktop/docker/Video-Platform/scripts/start-livekit.ps1)
- WSL LiveKit launcher in [scripts/start-livekit-wsl.sh](/c:/Users/sagar/Desktop/docker/Video-Platform/scripts/start-livekit-wsl.sh)

## Live Streaming Flow

The active live path is WebRTC-only.

1. Creator opens `/creator/live`
2. Browser gets camera and microphone permission
3. Frontend creates or updates the live session with `POST /live/session`
4. Frontend requests a publisher token with `POST /live/token/publisher`
5. Creator joins the creator room in LiveKit and publishes local tracks
6. Frontend marks the session live with `POST /live/session/start`
7. Viewers open `/live/{creatorId}`
8. Viewer page requests a viewer token with `POST /live/token/viewer`
9. Viewers join the same LiveKit room and watch over WebRTC

Live session state is stored in [backend/app/models/live_session.py](/c:/Users/sagar/Desktop/docker/Video-Platform/backend/app/models/live_session.py).

## Main Live APIs

- `POST /live/session`
- `GET /live/session/me`
- `POST /live/session/start`
- `POST /live/session/end`
- `POST /live/token/publisher`
- `POST /live/token/viewer`
- `GET /live/{creator_id}/room`
- `GET /live/{creator_id}/status`

## Run The Stack

From the project root:

```bash
docker compose up --build
```

If Docker Hub is flaky and you hit errors like `TLS handshake timeout` while resolving base images,
use the retrying helper script instead:

Windows PowerShell:

```powershell
./scripts/docker-up.ps1
```

WSL / Linux:

```bash
chmod +x ./scripts/docker-up.sh
./scripts/docker-up.sh
```

Those scripts pre-pull the required base images with retries, then run:
- `docker compose build --pull=false`
- `docker compose up -d --no-build`

This avoids re-querying Docker Hub during every compose build when the images are already cached locally.

Main URLs:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Health check: `http://localhost:8000/health`
- LiveKit signaling: `ws://localhost:7880`

Compose services:
- `frontend`
- `api`
- `postgres`
- `redis`
- `zookeeper`
- `kafka`
- `ffmpeg`

This now starts the React frontend and the backend stack together in Docker.
The frontend runs through nginx on port `3000` and proxies API plus websocket chat traffic to the backend container.

## Product Updates

- shared navbar with back + home navigation across the app
- subscribed channels hub with live join buttons
- navbar live notifications fed by creator uploads and live starts
- registration email verification before login
- upload-time visibility selection plus active creator-side public/private/delete controls
- more consistent video card sizing across feed and channel/studio pages
- thumbnail generation now samples the uploaded video dynamically instead of using a fixed timestamp

## LiveKit Setup

LiveKit is intentionally run outside Docker for local development, especially on Windows, so WebRTC media ports do not go through Docker Desktop NAT.

### Windows host

If `livekit-server` is installed in Windows and available in `PATH`, run:

```powershell
./scripts/start-livekit.ps1
```

That script:
- reads the default IPv4 route on Windows
- writes a runtime config to `infra/livekit/livekit.runtime.yaml`
- replaces `node_ip` with the machine's reachable IPv4 address
- starts `livekit-server` with that runtime config

### WSL

If you run `livekit-server` inside WSL, use:

```bash
chmod +x ./scripts/start-livekit-wsl.sh
./scripts/start-livekit-wsl.sh
```

Do not run `./scripts/start-livekit.ps1` directly from `bash`. It is a PowerShell script.

The WSL launcher:
- detects the current WSL IP
- writes `infra/livekit/livekit.runtime.yaml`
- starts `livekit-server` with the generated config

## Test Live Streaming

1. Start the Docker stack
2. Start LiveKit with the correct launcher for your environment
3. Log in as a creator
4. Open `http://localhost:3000/creator/live`
5. Click `Start preview` and allow camera and microphone
6. Click `Go live`
7. Open `http://localhost:3000/live/{creatorId}` in another tab or device

## Stability Notes

The current live client is tuned for longer sessions:
- creator and viewer connections use LiveKit reconnect support
- room connections are pre-warmed before joining
- adaptive stream and dynacast are enabled
- viewer pages retry when a creator comes online or reconnects
- creator preview is kept alive during transient room failures so reconnecting is faster

## Kafka And Docker Notes

Kafka and ZooKeeper are configured for a single-broker local dev environment:
- ZooKeeper has a readiness healthcheck
- Kafka waits for ZooKeeper to be healthy
- Kafka uses single-node-safe replication settings

If startup order gets stuck, restart cleanly:

```bash
docker compose down
docker compose up --build
```

Useful logs:

```bash
docker compose logs -f api
docker compose logs -f kafka
docker compose logs -f zookeeper
```

## Live Troubleshooting

### Creator connects, then disconnects immediately

If LiveKit logs show candidates like `127.0.0.1`, the server is advertising loopback instead of a reachable interface. Restart LiveKit with the provided Windows or WSL launcher so `node_ip` is rewritten into `infra/livekit/livekit.runtime.yaml`.

### Viewer cannot watch from another machine

If the app works only on the same PC, the browser may still be connecting to `localhost` or a private-only host. The backend and frontend already try to rewrite local LiveKit URLs to the current browser host, but the LiveKit server itself still must be reachable from that viewer.

### Internet-wide viewing

For true public streaming, LiveKit must be reachable on a public IP or domain, with the needed ports exposed correctly. Private LAN addresses like `172.x.x.x` only work inside the same local network scope.

### WSL script error with `.ps1`

If you see bash syntax errors from `start-livekit.ps1`, you ran the PowerShell script inside bash. Use `./scripts/start-livekit-wsl.sh` instead, or invoke PowerShell explicitly with `pwsh ./scripts/start-livekit.ps1`.

## Notes

- The older RTMP/nginx live flow has been removed from the active app path.
- VOD processing still depends on Kafka + FFmpeg + S3/CloudFront.
- Full runtime still depends on valid Docker, AWS, SMTP, and local network setup.

## AWS Deployment Notes

This repository is closer to production deployment now, but you still need to provide the real infrastructure values before shipping.

Set these environment variables for a deployed environment:
- `VITE_API_BASE_URL`
- `CORS_ORIGINS`
- `DATABASE_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET`
- `CLOUDFRONT_DOMAIN`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `EMAIL_FROM`
- `LIVEKIT_PUBLIC_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Recommended AWS shape:
- frontend container behind ALB or CloudFront
- API container on ECS/Fargate or EC2 behind ALB
- PostgreSQL on RDS
- Redis on ElastiCache
- S3 for source uploads, HLS output, and thumbnails
- CloudFront in front of video assets
- LiveKit on a publicly reachable host or cluster with correct UDP/TCP exposure

Before deploying:
- point `CORS_ORIGINS` at your real frontend domain, not `*`
- point `LIVEKIT_PUBLIC_URL` at the public LiveKit endpoint that viewers can reach
- configure SMTP so registration verification and reset emails can be delivered
- verify CloudFront is serving both `videos/hls/` and `videos/thumbnails/`
- keep Kafka/worker services running so uploaded videos are actually processed
