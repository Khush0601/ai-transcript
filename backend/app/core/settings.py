from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
