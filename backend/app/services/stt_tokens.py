import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from google import genai
from google.genai import errors, types

from app.core.settings import get_settings
from app.schemas.stt import SttTokenRequest, SttTokenResponse

logger = logging.getLogger(__name__)


async def create_ephemeral_token(
    client: genai.Client,
    request: SttTokenRequest,
) -> SttTokenResponse:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=15)
    language_codes = ["hi-IN", "en-IN"] if request.language_mode == "hindi_english" else []
    live_config = types.LiveConnectConfig(
        response_modalities=[types.Modality.TEXT],
        input_audio_transcription=types.AudioTranscriptionConfig(
            language_codes=language_codes,
            mode=types.AudioTranscriptionConfigMode.VERBATIM,
        ),
    )
    token_config = types.CreateAuthTokenConfig(
        uses=1,
        expire_time=expires_at,
        new_session_expire_time=now + timedelta(minutes=1),
        live_connect_constraints=types.LiveConnectConstraints(
            model=settings.gemini_live_model,
            config=live_config,
        ),
    )

    try:
        token = await client.aio.auth_tokens.create(config=token_config)
    except errors.APIError as exc:
        logger.warning(
            "Gemini ephemeral token request failed",
            extra={"provider_status_code": exc.code},
        )
        if exc.code == status.HTTP_429_TOO_MANY_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Speech transcription quota is temporarily unavailable.",
            ) from None
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create a speech transcription session.",
        ) from None

    if not token.name:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Speech provider returned an invalid session token.",
        )

    return SttTokenResponse(
        token=token.name,
        model=settings.gemini_live_model,
        language_mode=request.language_mode,
        expires_at=expires_at,
    )
