import secrets
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DB_URL: str = "postgresql+asyncpg://cmp:cmp_secret@127.0.0.1:5432/cmp_db"
    REDIS_URL: str = "redis://127.0.0.1:6379/0"
    JWT_SECRET: str = secrets.token_urlsafe(64)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE: int = 30  # minutes
    REFRESH_TOKEN_EXPIRE: int = 7  # days
    POSTFIX_VIRTUAL_MAP: str = "/etc/postfix/virtual.cf"
    POSTFIX_MAIN_CF: str = "/etc/postfix/main.cf"
    RSPAMD_OVERRIDE_DIR: str = "/etc/rspamd/override.d"
    DKIM_KEY_DIR: str = "/var/lib/cmp/dkim-keys"
    QUARANTINE_DIR: str = "/var/lib/cmp/quarantine"
    UPLOAD_DIR: str = "/var/lib/cmp/uploads"
    LOG_DIR: str = "/var/log/cmp"

    model_config = {"env_file": ".env", "env_prefix": "CMP_"}


settings = Settings()
