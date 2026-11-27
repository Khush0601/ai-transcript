from datetime import UTC, datetime

import pytest
from google import genai
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routers import stt as stt_router
from app.routers.stt import get_gemini_client
from app.schemas.stt import SttTokenRequest, SttTokenResponse


async def test_transcription_crud_and_search(client: AsyncClient) -> None:
    created = await client.post(
        "/api/transcriptions",
        json={
            "title": "Project meeting",
            "content": "Kal ki meeting reschedule karni hai.",
            "language_mode": "hindi_english",
            "duration_ms": 12500,
        },
    )
    assert created.status_code == 201
    transcription = created.json()
    assert transcription["title"] == "Project meeting"
    assert transcription["model"] == "gemini-3.5-transcribe-live"

    transcription_id = transcription["id"]
    fetched = await client.get(f"/api/transcriptions/{transcription_id}")
    assert fetched.status_code == 200
    assert fetched.json()["content"] == "Kal ki meeting reschedule karni hai."

    updated = await client.patch(
        f"/api/transcriptions/{transcription_id}",
        json={"title": "Rescheduled meeting", "content": "Invite sent."},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Rescheduled meeting"

    search = await client.get("/api/transcriptions", params={"search": "invite"})
    assert search.status_code == 200
    assert search.json()["total"] == 1
    assert search.json()["items"][0]["id"] == transcription_id

    deleted = await client.delete(f"/api/transcriptions/{transcription_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"id": transcription_id, "deleted": True}
    assert (await client.get(f"/api/transcriptions/{transcription_id}")).status_code == 404


async def test_transcriptions_are_scoped_to_signed_anonymous_cookie(
    client: AsyncClient,
) -> None:
    created = await client.post(
        "/api/transcriptions",
        json={"content": "Private to this browser."},
    )
    assert created.status_code == 201
    transcription_id = created.json()["id"]

    other_browser = AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    )
    try:
        assert (await other_browser.get("/api/transcriptions")).json()["total"] == 0
        assert (
            await other_browser.get(f"/api/transcriptions/{transcription_id}")
        ).status_code == 404
        assert (
            await other_browser.patch(
                f"/api/transcriptions/{transcription_id}",
                json={"title": "Unauthorized edit"},
            )
        ).status_code == 404
        assert (
            await other_browser.delete(f"/api/transcriptions/{transcription_id}")
        ).status_code == 404
    finally:
        await other_browser.aclose()


async def test_validation_uses_standard_error_shape(client: AsyncClient) -> None:
    response = await client.post(
        "/api/transcriptions",
        json={"content": "Invalid duration", "duration_ms": -1},
    )
    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "validation_error",
            "message": "Request validation failed.",
        }
    }


async def test_create_retry_with_same_request_id_is_idempotent(
    client: AsyncClient,
) -> None:
    body = {
        "content": "Saved once.",
        "client_request_id": "f8cfe477-4f4d-45d9-84d0-41fef6b28561",
    }

    first = await client.post("/api/transcriptions", json=body)
    retry = await client.post("/api/transcriptions", json=body)
    assert first.status_code == 201
    assert retry.status_code == 201
    assert retry.json()["id"] == first.json()["id"]


async def test_stt_token_route_uses_server_token_service(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    gemini_client = genai.Client(api_key="test-only-placeholder")

    async def issue_token(
        _: genai.Client,
        request: SttTokenRequest,
    ) -> SttTokenResponse:
        assert request.language_mode == "hindi_english"
        return SttTokenResponse(
            token="single-use-test-token",
            model="gemini-3.5-transcribe-live",
            language_mode=request.language_mode,
            expires_at=datetime.now(UTC),
        )

    monkeypatch.setattr(stt_router, "create_ephemeral_token", issue_token)
    monkeypatch.setitem(
        app.dependency_overrides,
        get_gemini_client,
        lambda: gemini_client,
    )
    try:
        response = await client.post(
            "/api/stt/token",
            json={"language_mode": "hindi_english"},
        )
    finally:
        gemini_client.close()
        await gemini_client.aio.aclose()

    assert response.status_code == 200
    assert response.json()["token"] == "single-use-test-token"
    assert response.json()["language_mode"] == "hindi_english"
