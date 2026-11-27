from unittest.mock import AsyncMock

import pytest
from google import genai
from google.genai import types

from app.schemas.stt import SttTokenRequest
from app.services.stt_tokens import create_ephemeral_token


@pytest.mark.parametrize(
    ("language_mode", "language_codes"),
    [
        ("auto", []),
        ("hindi_english", ["hi-IN", "en-IN"]),
    ],
)
async def test_ephemeral_token_is_single_use_and_config_constrained(
    language_mode: str,
    language_codes: list[str],
) -> None:
    client = genai.Client(api_key="test-only-placeholder")
    auth_tokens = client.aio.auth_tokens
    issue_token = AsyncMock(return_value=types.AuthToken(name="single-use-token"))
    auth_tokens.create = issue_token

    try:
        response = await create_ephemeral_token(
            client,
            SttTokenRequest(language_mode=language_mode),
        )
    finally:
        client.close()
        await client.aio.aclose()

    config = issue_token.await_args.kwargs["config"]
    live_config = config.live_connect_constraints.config
    assert response.token == "single-use-token"
    assert config.uses == 1
    assert config.live_connect_constraints.model == response.model
    assert live_config.response_modalities == [types.Modality.TEXT]
    assert live_config.input_audio_transcription.language_codes == language_codes
    assert live_config.input_audio_transcription.mode == types.AudioTranscriptionConfigMode.VERBATIM
