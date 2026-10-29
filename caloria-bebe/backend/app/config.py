"""Runtime settings, read once from the environment."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    jwt_ttl_hours: int
    cors_origins: list[str]


def load_settings() -> Settings:
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret) < 32:
        if os.environ.get("APP_ENV", "dev") == "production":
            raise RuntimeError("JWT_SECRET must be set to at least 32 characters in production")
        secret = "dev-only-insecure-secret-change-me-0000"
    origins = os.environ.get("CORS_ORIGINS", "")
    return Settings(
        database_url=os.environ.get("DATABASE_URL", "sqlite:///./caloria.db"),
        jwt_secret=secret,
        jwt_ttl_hours=int(os.environ.get("JWT_TTL_HOURS", "720")),
        cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
    )


settings = load_settings()
