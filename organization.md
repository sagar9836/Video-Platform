# Project Organization

## Overview
This project is organized as a full-stack video streaming platform with separate backend and frontend applications, plus supporting infrastructure and media-processing services.

## Top-level structure

- `backend/`
  - `app/`
    - `main.py`: FastAPI application entrypoint
    - `routes/`: HTTP route handlers for auth, users, videos, live streaming, analytics, admin flows
    - `models/`: SQLAlchemy models for users, videos, live sessions, analytics, subscriptions, notifications, creators, comments
    - `schemas/`: request/response DTOs for validation and serialization
    - `services/`: domain services for email, live presence, notifications, subscriptions, video asset management
    - `dependencies/`: dependency injection for auth and authorization
    - `graphql/`: GraphQL schema and resolver entrypoints
    - `db/`: database setup, base models, session utilities, initialization scripts
    - `redis/`: Redis client and analytics caching integration
    - `kafka/`: producer/consumer helpers and topics definitions for event processing
    - `utils/`: helper modules for CloudFront signed URLs, S3 uploads, FFmpeg wrappers, logging
    - `middlewares/`: application middleware for request processing
  - `ffmpeg_service/`
    - media processing worker that consumes Kafka events and prepares VOD assets
    - `Dockerfile`, `config.py`, `consumer.py`, `processor.py`, `ffmpeg_utils.py`, `s3_utils.py`

- `frontend/`
  - React + Vite single-page application
  - `src/`
    - `app/`: root app and route composition
    - `pages/`: user-facing pages, creator studio, live watch, admin pages
    - `components/`: reusable UI pieces and layout components
    - `auth/`: authentication context and guest session utilities
    - `api/`: REST/GraphQL client abstractions
    - `utils/`: app helper utilities
    - `assets/`: static image and media assets
  - `nginx.conf`: frontend container reverse proxy config
  - `package.json`: frontend dependencies and build scripts

- `infra/`:
  - LiveKit configuration files for runtime and cluster setup

- `scripts/`:
  - launcher scripts for starting LiveKit on Windows or WSL

- `docker-compose.yml`:
  - orchestration for frontend, backend, PostgreSQL, Redis, Kafka, ZooKeeper, LiveKit, FFmpeg worker, and recording/egress support

## Functional organization

- Authentication & authorization
  - JWT auth, password hashing, role-based access
  - email verification and account registration flows

- Creator and channel management
  - creator onboarding, channel creation, creator dashboards
  - video upload and studio controls

- Live streaming
  - LiveKit-powered WebRTC publisher/viewer flow
  - publisher token generation and live session lifecycle APIs
  - viewer join flow with room state and live chat support

- VOD and asset processing
  - direct video upload handling
  - Kafka-based background processing via `ffmpeg_service`
  - S3 upload and CloudFront asset delivery for recorded videos

- Administration
  - admin routes for users, videos, comments, reports, creator requests

## Deployment organization

- Docker Compose for local development
- AWS environment variables and S3/CloudFront integration expected for production
- LiveKit configured using runtime YAML files and exposed UDP/TCP ports for WebRTC

## Key responsibilities by folder

- `backend/app/routes/`: API contract and endpoint definitions
- `backend/app/models/`: persistent data schema and relations
- `backend/app/services/`: business logic separated from transport
- `backend/app/schemas/`: validation and serialization boundaries
- `frontend/src/pages/`: UI screen definitions and user journeys
- `frontend/src/api/`: backend integration and request orchestration
- `infra/`: infrastructure runtime configuration
- `scripts/`: environment-specific startup helpers
