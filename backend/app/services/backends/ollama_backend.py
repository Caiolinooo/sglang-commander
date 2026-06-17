"""Ollama backend — connects to an externally-managed Ollama instance.

Ollama runs its own lifecycle (``ollama serve``).  This backend only
talks to the Ollama HTTP API; it never spawns or kills the Ollama process.

``start()`` pulls the requested model.
``stop()``  is a graceful no-op.
"""

from typing import Optional

import httpx

from app.services.backends.base import BackendProvider, BackendType


class OllamaBackend(BackendProvider):
    backend_type = BackendType.OLLAMA

    def __init__(self) -> None:
        self._current_config: dict = {}
        self._is_connected: bool = False

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_running(self) -> bool:
        return self._is_connected

    @property
    def _base_url(self) -> str:
        host = self._current_config.get("host", "localhost")
        port = self._current_config.get("port", 11434)
        return f"http://{host}:{port}"

    # ------------------------------------------------------------------
    # BackendProvider interface
    # ------------------------------------------------------------------

    async def start(self, config: dict) -> dict:
        self._current_config = config
        model = config.get("model_path", config.get("model", ""))

        if not model:
            return {"status": "error", "message": "No model specified for Ollama pull"}

        # Verify Ollama is reachable first
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(self._base_url)
                if r.status_code != 200:
                    return {
                        "status": "error",
                        "message": f"Ollama not reachable at {self._base_url} (HTTP {r.status_code}). "
                                   "Is 'ollama serve' running?",
                    }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Cannot connect to Ollama at {self._base_url}: {e}. "
                           "Start it with 'ollama serve'.",
            }

        # Pull the model (streams progress, we wait for completion)
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                r = await client.post(
                    f"{self._base_url}/api/pull",
                    json={"name": model, "stream": False},
                )
                if r.status_code != 200:
                    return {
                        "status": "error",
                        "message": f"Ollama pull failed (HTTP {r.status_code}): {r.text[:500]}",
                    }
        except httpx.TimeoutException:
            return {
                "status": "error",
                "message": f"Ollama pull timed out for model '{model}'. "
                           "Try pulling manually: ollama pull " + model,
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Ollama pull failed: {e}",
            }

        self._is_connected = True
        return {
            "status": "started",
            "message": f"Model '{model}' pulled and ready on Ollama at {self._base_url}",
        }

    async def stop(self) -> dict:
        # Ollama manages its own lifecycle; we just disconnect.
        self._is_connected = False
        self._current_config = {}
        return {
            "status": "stopped",
            "message": "Disconnected from Ollama (Ollama process still running).",
        }

    async def restart(self, config: Optional[dict] = None) -> dict:
        await self.stop()
        cfg = config or self._current_config
        return await self.start(cfg)

    async def get_status(self) -> dict:
        reachable = False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(self._base_url)
                reachable = r.status_code == 200
        except Exception:
            pass

        model = self._current_config.get(
            "model_path", self._current_config.get("model", "")
        )
        return {
            "running": reachable,
            "model_path": model,
            "host": self._current_config.get("host", "localhost"),
            "port": self._current_config.get("port", 11434),
            "health": "healthy" if reachable else "unreachable",
        }

    async def get_logs(self, cursor: int = 0) -> dict:
        return {
            "lines": [
                "[INFO] Ollama logs are managed by the Ollama process. "
                "Check 'ollama serve' output or system journal."
            ],
            "cursor": 0,
        }

    async def health_check(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(self._base_url)
                if r.status_code == 200:
                    return {"status": "healthy", "detail": "Ollama is reachable"}
        except Exception as e:
            return {"status": "unreachable", "detail": str(e)}
        return {"status": "unknown"}

    async def get_model_info(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self._base_url}/api/tags")
                if r.status_code == 200:
                    return r.json()
        except Exception:
            return {}
        return {}
