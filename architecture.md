# Architecture Overview

## High-level architecture

This project is built as a distributed, full-stack video streaming platform with three major domains:

1. Frontend user interface
2. Backend business and API layer
3. Media and infrastructure services

The system is deployed locally using Docker Compose, with LiveKit for real-time WebRTC streaming and Kafka + FFmpeg for background VOD processing.

## Architecture components

### Frontend

- `frontend/`
- React + Vite SPA
- Routes for public videos, creator studio, live pages, subscriptions, admin panel, and authentication
- Uses `livekit-client` for publisher/viewer WebRTC connections
- Uses `video.js` and `hls.js` for playback and HLS support
- Communicates with backend APIs for sessions, video metadata, uploads, and authentication

### Backend

- `backend/app/main.py`
- FastAPI application exposing REST endpoints and GraphQL schema
- Authentication with JWT tokens and role-based access via dependencies
- Stores persistent data in PostgreSQL using SQLAlchemy models
- Uses Redis for live session state, counters, and caching
- Uses Kafka for decoupled event-driven processing of video uploads and analytics
- Email service for registration verification and notifications
- Provides endpoints for live token generation, live session control, viewer room data, video uploads, comments, subscriptions, analytics, and admin workflows

### Media processing and streaming

- Live streaming platform uses LiveKit server
  - Backend generates publisher/viewer tokens
  - Creator publishes local audio/video tracks to a LiveKit room
  - Viewers join the same room and view over WebRTC
- VOD processing pipeline uses Kafka + FFmpeg worker
  - Uploaded video metadata and events are sent to Kafka
  - `backend/ffmpeg_service/` consumes jobs, processes recordings, encodes assets, and uploads to S3
  - CloudFront serves final video assets and thumbnails

### Infrastructure

- `docker-compose.yml` orchestrates local stack
- `postgres` for relational data
- `redis` for cache and live state
- `zookeeper` + `kafka` for event queue and processing
- `livekit` for real-time media rooms
- `livekit-egress` / `ffmpeg` worker for recording and processing
- `frontend` served through nginx on port `3000`
- `api` on port `8000`

## Data flow

### Live session flow

1. Creator logs in and opens the live studio page
2. Creator requests a live session and publisher token
3. Creator uses LiveKit client to join and publish tracks
4. Backend marks the session live and stores session state
5. Viewer requests viewer token and join data
6. Viewer joins LiveKit room and watches via WebRTC

### Video upload / VOD flow

1. Creator uploads a video through the frontend
2. Backend receives the upload and persists metadata
3. Backend emits Kafka events for processing
4. FFmpeg worker consumes events and transcodes video
5. Processed assets are stored in S3 and served through CloudFront
6. Frontend displays video metadata and playback URLs

## Module architecture

### Backend modules

- `routes/`: API endpoint routing
- `models/`: domain entities and database representation
- `schemas/`: validation and serialization boundaries
- `services/`: application logic and external system interactions
- `dependencies/`: auth and role injection
- `kafka/`: message production and consumer definitions
- `redis/`: state and cache helpers
- `utils/`: cloud provider helpers, logging, and FFmpeg integration

### Frontend modules

- `auth/`: auth context and token handling
- `api/`: HTTP layer and request wrappers
- `components/`: reusable UI components
- `pages/`: navigation screens and user workflows
- `layouts/`: shared layout shells for different user roles
- `utils/`: utilities, helpers, and common functions

## Deployment architecture

- Local development: Docker Compose brings up all services and live components together
- LiveKit runtime is configured from `infra/livekit/livekit.runtime.yaml`
- Production deployment would require:
  - public LiveKit endpoint and correct UDP/TCP exposure
  - managed PostgreSQL, Redis, Kafka or event streaming service
  - AWS S3 for storage and CloudFront for CDN
  - secure environment variables and secrets management

## Architecture decisions

- Chose FastAPI for async backend and clean REST/GraphQL support
- React + Vite for fast frontend development and modern browser support
- LiveKit to avoid building raw WebRTC signaling/playback infrastructure
- Kafka for reliable, decoupled video-processing events
- FFmpeg worker separated from API to keep upload latency low
- Docker Compose for reproducible local environment and service isolation

## Notes

- The current architecture is optimized for local development and proof-of-concept production readiness.
- LiveKit is the central real-time streaming subsystem, while the backend remains responsible for authentication, business rules, and analytic event capture.
- S3 / CloudFront integration is present in the backend service even though local dev may not require all AWS pieces to be active.
