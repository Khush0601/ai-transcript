import os
from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

test_database_url = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://speech:speech@127.0.0.1:5435/speech_test",
)
database_name = test_database_url.rsplit("/", maxsplit=1)[-1].split("?", maxsplit=1)[0]
if not database_name.endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL must point to a database ending in '_test'.")

os.environ["DATABASE_URL"] = test_database_url
os.environ["APP_SECRET_KEY"] = "test-only-signing-key-with-at-least-32-characters"
os.environ["ENVIRONMENT"] = "test"

from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def clean_database() -> AsyncIterator[None]:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    try:
        yield
    finally:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client
