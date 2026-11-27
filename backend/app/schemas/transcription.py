from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

LanguageMode = Literal["auto", "hindi_english"]
ProviderName = Literal["gemini", "self_hosted"]


class TranscriptionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(default="Untitled transcription", min_length=1, max_length=200)
    content: str = Field(max_length=100_000)
    client_request_id: UUID | None = None
    language_mode: LanguageMode = "auto"
    provider: ProviderName = "gemini"
    model: str | None = Field(default=None, max_length=120)
    duration_ms: int = Field(default=0, ge=0, le=86_400_000)


class TranscriptionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=100_000)

    @model_validator(mode="after")
    def require_nonempty_update(self) -> "TranscriptionUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Updated fields cannot be null.")
        return self


class TranscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    title: str
    content: str
    language_mode: LanguageMode
    provider: ProviderName
    model: str
    duration_ms: int
    created_at: datetime
    updated_at: datetime


class TranscriptionListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[TranscriptionResponse]
    total: int
    page: int
    limit: int


class TranscriptionDeleteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    deleted: Literal[True]
