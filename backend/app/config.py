from pydantic_settings import BaseSettings
from typing import Optional
import os

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class Settings(BaseSettings):
    app_name: str = "SGLang Commander"
    version: str = "0.1.0"
    debug: bool = True

    host: str = "0.0.0.0"
    port: int = 8080

    database_url: str = "sqlite+aiosqlite:///./sglang_commander.db"
    setup_complete_file: str = ".setup_complete"

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url
        if url.startswith("sqlite+aiosqlite:///./"):
            filename = url.replace("sqlite+aiosqlite:///./", "")
            return f"sqlite+aiosqlite:///{os.path.join(_BASE_DIR, filename)}"
        return url

    @property
    def resolved_setup_complete_file(self) -> str:
        if os.path.isabs(self.setup_complete_file):
            return self.setup_complete_file
        return os.path.join(_BASE_DIR, self.setup_complete_file)

    jwt_secret_key: str = "change-me-to-a-secure-random-string"
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 30
    jwt_refresh_expire_days: int = 7

    zerotier_central_token: Optional[str] = None
    huggingface_token: Optional[str] = None

    sglang_default_host: str = "127.0.0.1"
    sglang_default_port: int = 30000

    update_check_url_github: str = "https://api.github.com/repos/user/sglang-commander/releases/latest"
    update_check_url_selfhosted: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
