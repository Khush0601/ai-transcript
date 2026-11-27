from app.core.settings import Settings


def test_neon_pooled_url_uses_asyncpg_ssl_and_pooler_safe_caches() -> None:
    settings = Settings(
        app_secret_key="test-only-signing-key-with-at-least-32-characters",
        database_url=(
            "postgresql://demo:secret@ep-example-pooler.us-east-2.aws.neon.tech/app"
            "?sslmode=require&channel_binding=require"
        ),
    )

    assert settings.database_url == (
        "postgresql+asyncpg://demo:secret@ep-example-pooler.us-east-2.aws.neon.tech/app"
        "?prepared_statement_cache_size=0&ssl=require"
    )
    assert settings.database_connect_args == {"statement_cache_size": 0}


def test_direct_neon_url_keeps_ssl_without_disabling_statement_caches() -> None:
    settings = Settings(
        app_secret_key="test-only-signing-key-with-at-least-32-characters",
        database_url=(
            "postgresql://demo:secret@ep-example.us-east-2.aws.neon.tech/app"
            "?sslmode=require&channel_binding=require"
        ),
    )

    assert settings.database_url == (
        "postgresql+asyncpg://demo:secret@ep-example.us-east-2.aws.neon.tech/app?ssl=require"
    )
    assert settings.database_connect_args == {}
