from collections.abc import Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transcription import Transcription


async def create_transcription(
    session: AsyncSession,
    *,
    client_id: UUID,
    values: dict[str, object],
) -> Transcription:
    transcription = Transcription(client_id=client_id, **values)
    session.add(transcription)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        request_id = values.get("client_request_id")
        if not isinstance(request_id, UUID):
            raise

        result = await session.execute(
            select(Transcription).where(
                Transcription.client_id == client_id,
                Transcription.client_request_id == request_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            raise

        same_request = all(
            getattr(existing, key) == value
            for key, value in values.items()
            if key != "client_request_id"
        )
        if not same_request:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This save identifier was already used for different content.",
            ) from None
        return existing

    await session.refresh(transcription)
    return transcription


async def list_transcriptions(
    session: AsyncSession,
    *,
    client_id: UUID,
    search: str | None,
    offset: int,
    limit: int,
) -> tuple[Sequence[Transcription], int]:
    filters = [Transcription.client_id == client_id]
    if search:
        title_match = func.lower(Transcription.title).contains(
            search.lower(),
            autoescape=True,
        )
        content_match = func.lower(Transcription.content).contains(
            search.lower(),
            autoescape=True,
        )
        filters.append(or_(title_match, content_match))

    total_result = await session.execute(
        select(func.count()).select_from(Transcription).where(*filters)
    )
    total = total_result.scalar_one()

    result = await session.execute(
        select(Transcription)
        .where(*filters)
        .order_by(Transcription.created_at.desc(), Transcription.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all(), total


async def get_transcription(
    session: AsyncSession,
    *,
    client_id: UUID,
    transcription_id: UUID,
) -> Transcription | None:
    result = await session.execute(
        select(Transcription).where(
            Transcription.id == transcription_id,
            Transcription.client_id == client_id,
        )
    )
    return result.scalar_one_or_none()


async def update_transcription(
    session: AsyncSession,
    transcription: Transcription,
    *,
    values: dict[str, str],
) -> Transcription:
    for field, value in values.items():
        setattr(transcription, field, value)
    await session.commit()
    await session.refresh(transcription)
    return transcription


async def delete_transcription(
    session: AsyncSession,
    transcription: Transcription,
) -> None:
    await session.delete(transcription)
    await session.commit()
