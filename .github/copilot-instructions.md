# Copilot instructions

## Project shape

- This repository is a monorepo with `frontend/` (React, TypeScript, Vite) and `backend/` (Python, FastAPI).
- Keep API routers thin: routers validate requests and delegate to services; services coordinate business logic; repositories own database access.
- Keep Pydantic schemas separate from SQLAlchemy models. Inject request-scoped database sessions with FastAPI `Depends`.
- Keep browser speech code behind the `TranscriptionProvider` interface. UI components must not import a speech vendor SDK.
- Generate frontend API types from FastAPI's OpenAPI schema instead of maintaining duplicate API types by hand.

## Safety and privacy

- Never commit secrets, local `.env` files, raw audio, or credentials. Keep `.env.example` limited to safe placeholders.
- `GEMINI_API_KEY` is server-only. Browser sessions may receive only short-lived, constrained ephemeral tokens.
- Do not persist raw audio or log secrets, audio, or transcript text by default.
- Scope every transcription query and mutation to the server-issued anonymous identity. Never trust a client-supplied owner ID.
- Keep production same-origin; do not add permissive CORS configuration.

## Implementation conventions

- Make focused changes that preserve existing behavior. Do not expand scope without approval.
- Use strict TypeScript; avoid `any`. Use Python 3.12+, full type hints, Pydantic v2, and async I/O for request paths.
- Use Ruff, mypy, pytest, ESLint, Prettier, and Vitest where applicable. Add focused tests for new behavior.
- Validate settings at startup and surface errors through the repository's standard response shape; do not silently substitute success values.
- Add and review Alembic migrations for schema changes. Test database behavior against PostgreSQL.
- Do not add Text to Speech. The assignment's isolated TTS mention is out of scope; this project is Speech to Text.

## Local development

- Start PostgreSQL with `docker compose up -d db`.
- Backend commands run from `backend/`; frontend commands run from `frontend/`.
- Vite proxies `/api` to the local FastAPI server. Keep local-only configuration out of production defaults.
- Run the smallest relevant test, lint, type-check, or build command after a change.
