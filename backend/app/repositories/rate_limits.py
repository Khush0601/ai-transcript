from datetime import datetime, timedelta

from sqlalchemy import case, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rate_limit import RateLimitBucket


async def consume_request(
    session: AsyncSession,
    *,
    ip_hash: str,
    now: datetime,
    limit: int,
    window: timedelta,
) -> tuple[int, datetime, bool]:
    expired_before = now - window
    expired = RateLimitBucket.window_started_at <= expired_before
    statement = (
        insert(RateLimitBucket)
        .values(
            ip_hash=ip_hash,
            window_started_at=now,
            request_count=1,
        )
        .on_conflict_do_update(
            index_elements=[RateLimitBucket.ip_hash],
            set_={
                "window_started_at": case(
                    (expired, now),
                    else_=RateLimitBucket.window_started_at,
                ),
                "request_count": case(
                    (expired, 1),
                    else_=RateLimitBucket.request_count + 1,
                ),
            },
            where=or_(
                expired,
                RateLimitBucket.request_count < limit,
            ),
        )
        .returning(
            RateLimitBucket.request_count,
            RateLimitBucket.window_started_at,
        )
    )
    result = await session.execute(statement)
    row = result.one_or_none()
    allowed = row is not None
    if row is None:
        row = (
            await session.execute(
                select(
                    RateLimitBucket.request_count,
                    RateLimitBucket.window_started_at,
                ).where(RateLimitBucket.ip_hash == ip_hash)
            )
        ).one()
    await session.commit()
    request_count, window_started_at = row
    return request_count, window_started_at, allowed


async def get_bucket(
    session: AsyncSession,
    *,
    ip_hash: str,
) -> tuple[int, datetime] | None:
    result = await session.execute(
        select(
            RateLimitBucket.request_count,
            RateLimitBucket.window_started_at,
        ).where(RateLimitBucket.ip_hash == ip_hash)
    )
    row = result.one_or_none()
    if row is None:
        return None
    request_count, window_started_at = row
    return request_count, window_started_at
