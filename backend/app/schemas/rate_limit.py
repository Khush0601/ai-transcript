from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RateLimitStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int
    remaining: int
    resets_at: datetime | None
