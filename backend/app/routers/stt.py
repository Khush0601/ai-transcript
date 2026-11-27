from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from google import genai

from app.schemas.errors import ErrorResponse
from app.schemas.stt import SttTokenRequest, SttTokenResponse
from app.services.rate_limits import enforce_rate_limit
from app.services.stt_tokens import create_ephemeral_token

router = APIRouter(prefix="/stt", tags=["speech transcription"])
RateLimitCheck = Annotated[None, Depends(enforce_rate_limit)]


def get_gemini_client(request: Request) -> genai.Client:
    client = getattr(request.app.state, "gemini_client", None)
    if not isinstance(client, genai.Client):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech transcription is not configured.",
        )
    return client


GeminiClient = Annotated[genai.Client, Depends(get_gemini_client)]


@router.post(
    "/token",
    response_model=SttTokenResponse,
    responses={
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def create_stt_token(
    request: SttTokenRequest,
    _rate_limit: RateLimitCheck,
    client: GeminiClient,
) -> SttTokenResponse:
    return await create_ephemeral_token(client, request)
