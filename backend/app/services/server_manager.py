"""Facade that delegates to the active backend provider (SGLang, llama.cpp, Ollama)."""

from typing import Optional
from app.services.backends.registry import backend_registry
from app.services.backends.base import BackendProvider


class ServerManager:
    """Facade that delegates to the active backend provider."""

    def __init__(self) -> None:
        self._registry = backend_registry
        # Set default active backend to 'sglang' if none set
        if not self._registry.get_active():
            self._registry.set_active("sglang")

    @property
    def active_backend(self) -> BackendProvider:
        backend = self._registry.get_active()
        if not backend:
            self._registry.set_active("sglang")
            backend = self._registry.get_active()
        return backend

    @property
    def is_running(self) -> bool:
        backend = self._registry.get_active()
        return backend.is_running if backend else False

    @property
    def pid(self) -> Optional[int]:
        backend = self._registry.get_active()
        if backend and hasattr(backend, "pid"):
            return backend.pid
        return None

    @property
    def uptime(self) -> Optional[float]:
        backend = self._registry.get_active()
        if backend and hasattr(backend, "uptime"):
            return backend.uptime
        return None

    async def start(self, config: dict) -> dict:
        # Extract backend_type if specified, default to current active or sglang
        backend_type = config.pop("backend_type", self._registry.active_name or "sglang")
        self._registry.set_active(backend_type)
        return await self.active_backend.start(config)

    async def stop(self) -> dict:
        return await self.active_backend.stop()

    async def restart(self, config: Optional[dict] = None) -> dict:
        if config:
            backend_type = config.pop("backend_type", self._registry.active_name or "sglang")
            self._registry.set_active(backend_type)
        return await self.active_backend.restart(config)

    async def get_status(self) -> dict:
        status = await self.active_backend.get_status()
        # Inject backend_type info for UI consumption
        status["backend_type"] = self._registry.active_name
        return status

    async def get_logs(self, cursor: int = 0) -> dict:
        return await self.active_backend.get_logs(cursor)

    async def health_check(self) -> dict:
        return await self.active_backend.health_check()

    async def get_model_info(self) -> dict:
        return await self.active_backend.get_model_info()


server_manager = ServerManager()
