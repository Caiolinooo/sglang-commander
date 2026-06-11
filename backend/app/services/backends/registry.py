"""Backend registry — factory + singleton map for backend providers.

Import this module to get a pre-populated ``backend_registry`` with all
shipped backends registered.  The registry is the single source of truth
for which backend is active.
"""

from typing import Optional

from app.services.backends.base import BackendProvider


class BackendRegistry:
    """Manages registered backend providers and tracks the active one."""

    def __init__(self) -> None:
        self._backends: dict[str, BackendProvider] = {}
        self._active_backend: Optional[str] = None

    def register(self, name: str, backend: BackendProvider) -> None:
        self._backends[name] = backend

    def get(self, name: str) -> BackendProvider:
        try:
            return self._backends[name]
        except KeyError:
            available = ", ".join(self._backends) or "(none)"
            raise ValueError(
                f"Unknown backend '{name}'. Available: {available}"
            )

    def get_active(self) -> Optional[BackendProvider]:
        if self._active_backend is None:
            return None
        return self._backends.get(self._active_backend)

    def set_active(self, name: str) -> None:
        if name not in self._backends:
            available = ", ".join(self._backends) or "(none)"
            raise ValueError(
                f"Cannot activate unknown backend '{name}'. Available: {available}"
            )
        self._active_backend = name

    @property
    def active_name(self) -> Optional[str]:
        return self._active_backend

    def list_backends(self) -> list[dict]:
        return [
            {
                "name": name,
                "type": backend.backend_type.value,
                "active": name == self._active_backend,
                "running": backend.is_running,
            }
            for name, backend in self._backends.items()
        ]


# ------------------------------------------------------------------
# Module-level singleton with all shipped backends pre-registered
# ------------------------------------------------------------------

backend_registry = BackendRegistry()


def _register_defaults() -> None:
    from app.services.backends.sglang_backend import SglangBackend
    from app.services.backends.llamacpp_backend import LlamaCppBackend
    from app.services.backends.ollama_backend import OllamaBackend
    from app.services.backends.vllm_backend import VllmBackend

    backend_registry.register("sglang", SglangBackend())
    backend_registry.register("llamacpp", LlamaCppBackend())
    backend_registry.register("ollama", OllamaBackend())
    backend_registry.register("vllm", VllmBackend())


_register_defaults()
