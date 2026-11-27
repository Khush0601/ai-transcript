import hashlib
import hmac
import ipaddress
import math
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.db.session import get_db_session
from app.repositories import rate_limits as repository
from app.schemas.rate_limit import RateLimitStatus

REQUEST_LIMIT = 10
WINDOW = timedelta(hours=1)
DatabaseSession = Annotated[AsyncSession, Depends(get_db_session)]


def _client_ip_hash(request: Request) -> str:
    client = request.client
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client address is unavailable.",
        )
    settings = get_settings()
    forwarded_for = (
        request.headers.get("x-forwarded-for") if settings.environment == "production" else None
    )
    client_host = (
        forwarded_for.rsplit(",", maxsplit=1)[-1].strip() if forwarded_for else client.host
    )
    try:
        client_ip = ipaddress.ip_address(client_host).compressed
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client address is invalid.",
        ) from None

    secret = settings.app_secret_key.get_secret_value().encode()
    return hmac.new(secret, client_ip.encode(), hashlib.sha256).hexdigest()


def _status(
    *,
    request_count: int,
    window_started_at: datetime,
) -> RateLimitStatus:
    resets_at = window_started_at + WINDOW
    remaining = max(0, REQUEST_LIMIT - request_count)
    return RateLimitStatus(
        limit=REQUEST_LIMIT,
        remaining=remaining,
        resets_at=resets_at,
    )


def _apply_headers(
    request: Request,
    response: Response,
    quota: RateLimitStatus,
) -> dict[str, str]:
    reset_timestamp = math.ceil(quota.resets_at.timestamp()) if quota.resets_at is not None else 0
    headers = {
        "X-RateLimit-Limit": str(quota.limit),
        "X-RateLimit-Remaining": str(quota.remaining),
        "X-RateLimit-Reset": str(reset_timestamp),
    }
    request.state.rate_limit_headers = headers
    response.headers.update(headers)
    return headers


async def enforce_rate_limit(
    request: Request,
    response: Response,
    session: DatabaseSession,
) -> None:
    request_count, window_started_at, allowed = await repository.consume_request(
        session,
        ip_hash=_client_ip_hash(request),
        now=datetime.now(UTC),
        limit=REQUEST_LIMIT,
        window=WINDOW,
    )
    quota = _status(
        request_count=request_count,
        window_started_at=window_started_at,
    )
    headers = _apply_headers(request, response, quota)
    if not allowed:
        if quota.resets_at is not None:
            headers["Retry-After"] = str(
                max(
                    1,
                    math.ceil((quota.resets_at - datetime.now(UTC)).total_seconds()),
                )
            )
            request.state.rate_limit_headers = headers
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Request limit reached. Try again after the reset time.",
            headers=headers,
        )


async def get_rate_limit_status(
    request: Request,
    session: AsyncSession,
) -> RateLimitStatus:
    bucket = await repository.get_bucket(
        session,
        ip_hash=_client_ip_hash(request),
    )
    if bucket is None:
        return RateLimitStatus(
            limit=REQUEST_LIMIT,
            remaining=REQUEST_LIMIT,
            resets_at=None,
        )

    request_count, window_started_at = bucket
    if window_started_at + WINDOW <= datetime.now(UTC):
        return RateLimitStatus(
            limit=REQUEST_LIMIT,
            remaining=REQUEST_LIMIT,
            resets_at=None,
        )
    return _status(
        request_count=request_count,
        window_started_at=window_started_at,
    )
