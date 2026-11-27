from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from google import genai
from starlette.middleware.sessions import SessionMiddleware

from app.core.errors import install_error_handlers
from app.core.settings import get_settings
from app.db.session import engine
from app.routers.health import router as health_router
from app.routers.stt import router as stt_router
from app.routers.transcriptions import router as transcriptions_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    gemini_client = (
        genai.Client(
            api_key=settings.gemini_api_key.get_secret_value(),
            http_options={"api_version": "v1beta"},
        )
        if settings.gemini_api_key is not None
        else None
    )
    app.state.gemini_client = gemini_client
    try:
        yield
    finally:
        if gemini_client is not None:
            gemini_client.close()
            await gemini_client.aio.aclose()
        await engine.dispose()


app = FastAPI(
    title="Speech to Text API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.app_secret_key.get_secret_value(),
    session_cookie="speech_session",
    max_age=60 * 60 * 24 * 365,
    same_site="lax",
    https_only=settings.environment == "production",
)
app.include_router(health_router, prefix="/api")
app.include_router(stt_router, prefix="/api")
app.include_router(transcriptions_router, prefix="/api")
install_error_handlers(app)
