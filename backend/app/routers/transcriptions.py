from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.identity import get_client_id
from app.db.session import get_db_session
from app.models.transcription import Transcription
from app.schemas.errors import ErrorResponse
from app.schemas.transcription import (
    TranscriptionCreate,
    TranscriptionDeleteResponse,
    TranscriptionListResponse,
    TranscriptionResponse,
    TranscriptionUpdate,
)
from app.services import transcriptions as service
from app.services.rate_limits import enforce_rate_limit

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db_session)]
ClientIdentity = Annotated[UUID, Depends(get_client_id)]
RateLimitCheck = Annotated[None, Depends(enforce_rate_limit)]


@router.post(
    "",
    response_model=TranscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    responses={422: {"model": ErrorResponse}, 429: {"model": ErrorResponse}},
)
async def create_transcription(
    data: TranscriptionCreate,
    session: DatabaseSession,
    client_id: ClientIdentity,
    _rate_limit: RateLimitCheck,
) -> Transcription:
    return await service.create_transcription(
        session,
        client_id=client_id,
        data=data,
    )


@router.get(
    "",
    response_model=TranscriptionListResponse,
    responses={422: {"model": ErrorResponse}},
)
async def list_transcriptions(
    session: DatabaseSession,
    client_id: ClientIdentity,
    search: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> TranscriptionListResponse:
    items, total = await service.list_transcriptions(
        session,
        client_id=client_id,
        search=search,
        page=page,
        limit=limit,
    )
    return TranscriptionListResponse(items=items, total=total, page=page, limit=limit)


@router.get(
    "/{transcription_id}",
    response_model=TranscriptionResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
async def read_transcription(
    transcription_id: UUID,
    session: DatabaseSession,
    client_id: ClientIdentity,
) -> Transcription:
    return await service.get_transcription(
        session,
        client_id=client_id,
        transcription_id=transcription_id,
    )


@router.patch(
    "/{transcription_id}",
    response_model=TranscriptionResponse,
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
    },
)
async def patch_transcription(
    transcription_id: UUID,
    data: TranscriptionUpdate,
    session: DatabaseSession,
    client_id: ClientIdentity,
    _rate_limit: RateLimitCheck,
) -> Transcription:
    return await service.update_transcription(
        session,
        client_id=client_id,
        transcription_id=transcription_id,
        data=data,
    )


@router.delete(
    "/{transcription_id}",
    response_model=TranscriptionDeleteResponse,
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
    },
)
async def remove_transcription(
    transcription_id: UUID,
    session: DatabaseSession,
    client_id: ClientIdentity,
    _rate_limit: RateLimitCheck,
) -> TranscriptionDeleteResponse:
    await service.delete_transcription(
        session,
        client_id=client_id,
        transcription_id=transcription_id,
    )
    return TranscriptionDeleteResponse(id=transcription_id, deleted=True)
