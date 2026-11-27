from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_ignore_empty=True,
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["development", "test", "production"] = "development"
    app_secret_key: SecretStr = Field(min_length=32)
    database_url: str = "postgresql+asyncpg://speech:speech@127.0.0.1:5435/speech"
    gemini_api_key: SecretStr | None = None
    gemini_live_model: str = "gemini-3.5-transcribe-live"

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        try:
            url = make_url(value)
        except ArgumentError:
            raise ValueError("DATABASE_URL must be a valid PostgreSQL connection URL.") from None

        if url.drivername in {"postgres", "postgresql"}:
            url = url.set(drivername="postgresql+asyncpg")
        if url.drivername != "postgresql+asyncpg":
            raise ValueError("DATABASE_URL must use PostgreSQL with the asyncpg driver.")

        query = dict(url.query)
        sslmode = query.pop("sslmode", None)
        query.pop("channel_binding", None)
        if sslmode is not None:
            query.setdefault("ssl", sslmode)

        if "-pooler." in (url.host or ""):
            query.setdefault("prepared_statement_cache_size", "0")
            query.setdefault("statement_cache_size", "0")

        return url.set(query=query).render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
