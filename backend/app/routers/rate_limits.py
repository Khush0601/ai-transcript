from fastapi import APIRouter, Request, Response

from app.schemas.rate_limit import RateLimitStatus
from app.services.rate_limits import DatabaseSession, get_rate_limit_status

router = APIRouter(tags=["rate limits"])


@router.get("/rate-limit", response_model=RateLimitStatus)
async def read_rate_limit(
    request: Request,
    response: Response,
    session: DatabaseSession,
) -> RateLimitStatus:
    response.headers["Cache-Control"] = "no-store"
    return await get_rate_limit_status(request, session)
