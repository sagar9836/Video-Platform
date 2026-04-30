# Package Summary

## Frontend package

File: `frontend/package.json`

- Framework: React + Vite
- Bundler: Vite
- UI: Material UI (`@mui/material`, `@mui/icons-material`)
- Video playback: `video.js`
- LiveKit client: `livekit-client`
- State/query: `@tanstack/react-query`
- HTTP client: `axios`
- HLS playback support: `hls.js`

### Frontend scripts

- `dev`: start Vite development server
- `build`: build production static assets
- `lint`: run ESLint
- `preview`: preview the built app locally

### Frontend dependencies

- `react` ^19.2.0
- `react-dom` ^19.2.0
- `react-router-dom` ^7.12.0
- `axios` ^1.13.2
- `hls.js` ^1.6.15
- `livekit-client` ^2.15.4
- `@tanstack/react-query` ^5.90.16
- `@emotion/react`, `@emotion/styled`
- `@mui/material`, `@mui/icons-material`
- `video.js` ^8.23.4

### Dev dependencies

- `vite` ^7.2.4
- `@vitejs/plugin-react` ^5.1.1
- `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- `tailwindcss` ^4.1.18
- `@tailwindcss/vite`
- `postcss`, `autoprefixer`
- `@types/react`, `@types/react-dom`

## Backend package

File: `backend/requirements.txt`

- Backend framework: `fastapi`
- ASGI server: `uvicorn[standard]`
- ORM: `sqlalchemy>=2.0`
- Database driver: `asyncpg==0.29.0`
- Async Kafka: `aiokafka`
- Redis client: `redis`
- AWS SDK: `boto3`
- LiveKit API: `livekit-api>=0.8.0`
- Authentication and security:
  - `python-jose[cryptography]`
  - `passlib[bcrypt]`
- Validation: `pydantic`, `pydantic[email]`, `pydantic-settings`
- HTTP client: `httpx`
- GraphQL support: `strawberry-graphql[fastapi]`
- File upload support: `python-multipart`
- Static file serving: `aiofiles`
- Templating: `jinja2`
- SQLite support for local use: `aiosqlite`

## Runtime and infrastructure packages

- `postgres:15` as the SQL database
- `redis:7` for caching, live presence, and counters
- `confluentinc/cp-zookeeper:7.5.0` and `confluentinc/cp-kafka:7.5.0` for event processing
- `livekit/livekit-server` for WebRTC room management
- `nginx` inside the frontend container for static delivery

## Deployment packages

- `docker-compose.yml` orchestrates:
  - `frontend`
  - `api`
  - `postgres`
  - `redis`
  - `zookeeper`
  - `kafka`
  - `livekit`
  - `livekit-egress` / recording
  - `ffmpeg`

## Key environment dependencies

The project depends on these environment variables in `.env`:

- `DATABASE_URL`
- `JWT_SECRET`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- `KAFKA_BOOTSTRAP_SERVERS`
- `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`
- `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY_PATH`
- `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- SMTP settings for email delivery
