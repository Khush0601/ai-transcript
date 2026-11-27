from collections.abc import Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.models.transcription import Transcription
from app.repositories import transcriptions as repository
from app.schemas.transcription import TranscriptionCreate, TranscriptionUpdate


async def create_transcription(
    session: AsyncSession,
    *,
    client_id: UUID,
    data: TranscriptionCreate,
) -> Transcription:
    values = data.model_dump(exclude={"model"})
    values["model"] = data.model or get_settings().gemini_live_model
    return await repository.create_transcription(
        session,
        client_id=client_id,
        values=values,
    )


async def list_transcriptions(
    session: AsyncSession,
    *,
    client_id: UUID,
    search: str | None,
    page: int,
    limit: int,
) -> tuple[Sequence[Transcription], int]:
    return await repository.list_transcriptions(
        session,
        client_id=client_id,
        search=search,
        offset=(page - 1) * limit,
        limit=limit,
    )


async def get_transcription(
    session: AsyncSession,
    *,
    client_id: UUID,
    transcription_id: UUID,
) -> Transcription:
    transcription = await repository.get_transcription(
        session,
        client_id=client_id,
        transcription_id=transcription_id,
    )
    if transcription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found.",
        )
    return transcription


async def update_transcription(
    session: AsyncSession,
    *,
    client_id: UUID,
    transcription_id: UUID,
    data: TranscriptionUpdate,
) -> Transcription:
    transcription = await get_transcription(
        session,
        client_id=client_id,
        transcription_id=transcription_id,
    )
    return await repository.update_transcription(
        session,
        transcription,
        values=data.model_dump(exclude_unset=True),
    )


async def delete_transcription(
    session: AsyncSession,
    *,
    client_id: UUID,
    transcription_id: UUID,
) -> None:
    transcription = await get_transcription(
        session,
        client_id=client_id,
        transcription_id=transcription_id,
    )
    await repository.delete_transcription(session, transcription)
