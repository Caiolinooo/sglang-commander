"""Abstract base class for inference server backends."""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional


class BackendType(str, Enum):
    SGLANG = "sglang"
    LLAMACPP = "llamacpp"
    OLLAMA = "ollama"
    VLLM = "vllm"


class BackendProvider(ABC):
    """Contract every backend must implement.

    All methods return plain dicts so the API layer stays decoupled
    from backend-specific models.
    """

    backend_type: BackendType

    @abstractmethod
    async def start(self, config: dict) -> dict:
        """Launch or connect to the inference server."""

    @abstractmethod
    async def stop(self) -> dict:
        """Gracefully shut down (or disconnect from) the server."""

    @abstractmethod
    async def restart(self, config: Optional[dict] = None) -> dict:
        """Stop then start, optionally with a new config."""

    @abstractmethod
    async def get_status(self) -> dict:
        """Return current running state, model info, uptime, etc."""

    @abstractmethod
    async def get_logs(self, cursor: int = 0) -> dict:
        """Return log lines starting from *cursor*."""

    @abstractmethod
    async def health_check(self) -> dict:
        """Probe the server's health endpoint."""

    @abstractmethod
    async def get_model_info(self) -> dict:
        """Return metadata about the loaded model."""

    @property
    @abstractmethod
    def is_running(self) -> bool:
        """Whether the backend is currently serving."""
