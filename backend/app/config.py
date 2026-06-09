import json
import os
import secrets
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _auto_detect_cuda_home() -> Optional[str]:
    """Detect CUDA home from common locations and nvidia-smi."""
    candidates = [
        os.environ.get("CUDA_HOME"),
        os.environ.get("CUDA_PATH"),
        "/usr/local/cuda",
        "/usr/lib/cuda",
    ]
    # Check for pip-installed nvidia packages
    try:
        import importlib.util
        spec = importlib.util.find_spec("nvidia")
        if spec and spec.submodule_search_locations:
            for loc in spec.submodule_search_locations:
                cuda_dir = os.path.join(loc, "cuda_runtime")
                if os.path.isdir(cuda_dir):
                    candidates.append(cuda_dir)
    except Exception:
        pass

    for path in candidates:
        if path and os.path.isdir(path):
            return path
    return None


def _auto_detect_venv_path() -> Optional[str]:
    """Detect virtual environment path."""
    import sys
    if hasattr(sys, "prefix") and sys.prefix != getattr(sys, "base_prefix", sys.prefix):
        return sys.prefix
    # Check common venv locations relative to project
    for name in [".venv", "venv", "env"]:
        candidate = os.path.join(_BASE_DIR, name)
        if os.path.isdir(candidate):
            return candidate
    return None


class Settings(BaseSettings):
    # --- Application ---
    app_name: str = "SGLang Commander"
    version: str = "0.2.0"
    debug: bool = False

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8080

    # --- Database ---
    database_url: str = "sqlite+aiosqlite:///./data/sglang_commander.db"
    setup_complete_file: str = ".setup_complete"

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url
        if url.startswith("sqlite+aiosqlite:///./"):
            filename = url.replace("sqlite+aiosqlite:///./", "")
            db_path = os.path.join(_BASE_DIR, filename)
            # Ensure directory exists
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            return f"sqlite+aiosqlite:///{db_path}"
        return url

    @property
    def resolved_setup_complete_file(self) -> str:
        if os.path.isabs(self.setup_complete_file):
            return self.setup_complete_file
        return os.path.join(_BASE_DIR, self.setup_complete_file)

    # --- Security ---
    jwt_secret_key: str = Field(
        default_factory=lambda: os.environ.get("JWT_SECRET") or secrets.token_hex(32)
    )
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 30
    jwt_refresh_expire_days: int = 7

    # --- CORS ---
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    @property
    def cors_origins_list(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # --- SGLang Backend ---
    sglang_default_host: str = "127.0.0.1"
    sglang_default_port: int = 30000

    # --- llama.cpp Backend ---
    llamacpp_binary_path: Optional[str] = None  # Auto-detected via PATH
    llamacpp_host: str = "127.0.0.1"
    llamacpp_port: int = 8081
    llamacpp_models_dir: Optional[str] = None

    # --- Ollama Backend ---
    ollama_host: str = "http://localhost:11434"

    # --- Environment ---
    cuda_home: Optional[str] = None
    venv_path: Optional[str] = None
    sglang_extra_env: str = "{}"  # JSON string

    @property
    def resolved_cuda_home(self) -> Optional[str]:
        return self.cuda_home or _auto_detect_cuda_home()

    @property
    def resolved_venv_path(self) -> Optional[str]:
        return self.venv_path or _auto_detect_venv_path()

    @property
    def resolved_extra_env(self) -> dict:
        try:
            return json.loads(self.sglang_extra_env)
        except (json.JSONDecodeError, TypeError):
            return {}

    # --- HuggingFace ---
    huggingface_token: Optional[str] = Field(
        default=None, alias="HF_TOKEN"
    )

    # --- Model Management ---
    model_scan_dirs: str = ""  # Comma-separated extra directories

    @property
    def resolved_model_scan_dirs(self) -> list[str]:
        """All directories to scan for local models."""
        dirs = [
            os.path.expanduser("~/.cache/huggingface/hub"),
            os.environ.get("HF_HOME", ""),
            os.path.expanduser("~/models"),
        ]
        if self.model_scan_dirs:
            dirs.extend(d.strip() for d in self.model_scan_dirs.split(",") if d.strip())
        return [d for d in dirs if d and os.path.isdir(d)]

    # --- ZeroTier ---
    zerotier_central_token: Optional[str] = None

    # --- Updates ---
    update_check_url_github: str = "https://api.github.com/repos/Caiolinooo/sglang-commander/releases/latest"
    update_check_url_selfhosted: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        populate_by_name = True


settings = Settings()
