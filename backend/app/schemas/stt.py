from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.transcription import LanguageMode


class SttTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language_mode: LanguageMode = "auto"


class SttTokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str
    model: str
    language_mode: LanguageMode
    expires_at: datetime
