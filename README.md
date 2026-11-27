# Speech to Text

A monorepo for a real-time speech-to-text web app. The assignment mentions
“Text to Speech” once, but the rest of the requirements describe transcription;
Text to Speech is intentionally out of scope.

## Local development

Requirements: Python 3.12+, `uv`, Node.js, npm, and Docker Compose.

1. Copy `.env.example` to `.env`. The included secret is for local development
   only. Set `GEMINI_API_KEY` to enable live recording.
2. Start the local database:

   ```powershell
   docker compose up -d db
   ```

   The Compose database is published on port `5435` to avoid colliding with a
   PostgreSQL server already running on the default port.
   If `.env` already exists, update its `DATABASE_URL` to use port `5435`;
   keep any private keys in that file local.

3. Apply the migration and start the backend from `backend/`:

   ```powershell
   uv sync
   uv run alembic upgrade head
   uv run uvicorn app.main:app --reload
   ```

4. Start the frontend from `frontend/`:

   ```powershell
   npm ci
   npm run dev
   ```

The Vite development server proxies `/api` to FastAPI on port 8000.

The API provides health and anonymous-cookie-scoped transcription CRUD, search,
and pagination. The recorder requests a single-use, short-lived token from
FastAPI; the Gemini API key remains server-side. The browser streams mono,
16 kHz PCM audio to Gemini Live and saves finalized transcript text through the
API. Audio is not stored. A local recovery draft is kept in browser storage
until the transcript is saved or discarded. Each recording stops at 10 minutes.

Generate frontend API types while FastAPI is running:

```powershell
Set-Location frontend
npm run generate:api
```

To run backend tests, create a separate test database once:

```powershell
docker compose exec db createdb -U speech speech_test
Set-Location backend
uv run pytest
```

Tests refuse to run unless their database name ends in `_test`.

Run the frontend unit tests and checks from `frontend/`:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENT` | Runtime environment (`development`, `test`, or `production`). |
| `APP_SECRET_KEY` | Server-side signing key; use a strong private value outside local development. |
| `DATABASE_URL` | SQLAlchemy async PostgreSQL URL (`postgresql+asyncpg`). |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Local Compose database settings. |
| `GEMINI_API_KEY` | Server-only Gemini API key required for live recording; never expose it to frontend code. |
| `GEMINI_LIVE_MODEL` | Live transcription model; defaults to `gemini-3.5-transcribe-live`. |

## Architecture

The app uses React, TypeScript, Vite, and TanStack Query; FastAPI, Pydantic v2,
SQLAlchemy async, and Alembic; and PostgreSQL. Browser audio is captured through
an AudioWorklet, resampled to mono 16 kHz PCM16, then streamed to the Gemini
Live API using a short-lived, server-issued ephemeral token. UI components
depend on the `TranscriptionProvider` interface rather than a vendor SDK.
FastAPI stores transcript text and metadata scoped to an anonymous,
server-issued cookie identity. Raw audio is not stored.

The default model is `gemini-3.5-transcribe-live`, Google's dedicated Live
transcription model. It is preferred over a general Live model because the
assignment's core feature is speech recognition, not a conversational agent.
The browser uses the model through a `TranscriptionProvider` abstraction so a
self-hosted provider can be added later without coupling UI components to a
vendor SDK.

## Trade-offs and known limitations

- The initial release targets Gemini Live; a self-hosted speech engine is
  optional follow-up work.
- The recorder and history dashboard are available for recording, searching,
  reviewing, editing, copying, and deleting saved transcripts.
- Browser microphone access requires HTTPS, except on localhost during
  development.
- Anonymous history is tied to the visitor's browser cookie. Clearing that
  cookie loses access to those records; there is no account-based recovery.
- Transcripts are retained until the visitor deletes them. Audio is not stored.
- A Live API session is capped conservatively to avoid abrupt connection
  termination.
- Deployment is intentionally deferred until local development is reviewed.
