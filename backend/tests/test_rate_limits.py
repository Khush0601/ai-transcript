from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update

from app.core.settings import get_settings
from app.db.session import SessionFactory
from app.main import app
from app.models.rate_limit import RateLimitBucket
from app.services import rate_limits


async def test_sensitive_requests_have_a_ten_request_hourly_ip_limit(
    client: AsyncClient,
) -> None:
    for request_number in range(10):
        response = await client.post(
            "/api/transcriptions",
            json={"content": f"Transcript {request_number}"},
        )
        assert response.status_code == 201
        assert response.headers["x-ratelimit-limit"] == "10"
        assert response.headers["x-ratelimit-remaining"] == str(9 - request_number)

    limited = await client.post(
        "/api/transcriptions",
        json={"content": "This request exceeds the limit."},
    )
    assert limited.status_code == 429
    assert limited.headers["x-ratelimit-remaining"] == "0"
    assert int(limited.headers["retry-after"]) > 0
    assert limited.json()["error"]["code"] == "rate_limited"

    status = await client.get("/api/rate-limit")
    assert status.status_code == 200
    assert status.json()["remaining"] == 0
    assert status.json()["resets_at"] is not None


async def test_reads_do_not_consume_quota_and_limit_is_per_ip(
    client: AsyncClient,
) -> None:
    for _ in range(12):
        assert (await client.get("/api/transcriptions")).status_code == 200
        assert (await client.get("/api/rate-limit")).status_code == 200

    other_ip = AsyncClient(
        transport=ASGITransport(app=app, client=("198.51.100.22", 1234)),
        base_url="http://test",
    )
    try:
        response = await other_ip.post(
            "/api/transcriptions",
            json={"content": "A different IP has its own quota."},
        )
        assert response.status_code == 201
        assert response.headers["x-ratelimit-remaining"] == "9"
    finally:
        await other_ip.aclose()


async def test_forwarded_ip_uses_the_proxy_appended_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(
        rate_limits,
        "get_settings",
        lambda: settings.model_copy(update={"environment": "production"}),
    )
    first_client = AsyncClient(
        transport=ASGITransport(app=app, client=("10.0.0.2", 1234)),
        base_url="http://test",
        headers={"X-Forwarded-For": "203.0.113.1, 198.51.100.22"},
    )
    second_client = AsyncClient(
        transport=ASGITransport(app=app, client=("10.0.0.3", 1234)),
        base_url="http://test",
        headers={"X-Forwarded-For": "203.0.113.2, 198.51.100.22"},
    )
    try:
        first = await first_client.post(
            "/api/transcriptions",
            json={"content": "First forwarded request."},
        )
        second = await second_client.post(
            "/api/transcriptions",
            json={"content": "Second forwarded request."},
        )
        assert first.headers["x-ratelimit-remaining"] == "9"
        assert second.headers["x-ratelimit-remaining"] == "8"
    finally:
        await first_client.aclose()
        await second_client.aclose()


async def test_quota_resets_one_hour_after_first_request(
    client: AsyncClient,
) -> None:
    first = await client.post(
        "/api/transcriptions",
        json={"content": "First request in the window."},
    )
    assert first.status_code == 201
    assert first.headers["x-ratelimit-remaining"] == "9"

    async with SessionFactory() as session:
        await session.execute(
            update(RateLimitBucket).values(
                window_started_at=datetime.now(UTC) - timedelta(hours=1, seconds=1)
            )
        )
        await session.commit()

    after_reset = await client.post(
        "/api/transcriptions",
        json={"content": "First request after the reset."},
    )
    assert after_reset.status_code == 201
    assert after_reset.headers["x-ratelimit-remaining"] == "9"


async def test_security_headers_are_present(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "microphone=(self)" in response.headers["permissions-policy"]
