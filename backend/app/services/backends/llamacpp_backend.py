"""llama.cpp backend — manages a ``llama-server`` subprocess.

Supports single-model mode (``--model``) and router/directory mode
(``--models-dir``).  The llama.cpp server already exposes an
OpenAI-compatible API, so health checks and model info are standard
HTTP calls.
"""

import asyncio
import os
import shutil
import time
from typing import Optional

import httpx

from app.config import settings
from app.services.backends.base import BackendProvider, BackendType


class LlamaCppBackend(BackendProvider):
    backend_type = BackendType.LLAMACPP

    def __init__(self) -> None:
        self._process: Optional[asyncio.subprocess.Process] = None
        self._log_lines: list[str] = []
        self._start_time: Optional[float] = None
        self._current_config: dict = {}
        self._health_status: str = "unknown"

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_running(self) -> bool:
        return self._process is not None and self._process.returncode is None

    @property
    def pid(self) -> Optional[int]:
        return self._process.pid if self._process else None

    @property
    def uptime(self) -> Optional[float]:
        if self._start_time and self.is_running:
            return time.time() - self._start_time
        return None

    # ------------------------------------------------------------------
    # Binary resolution
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_binary() -> Optional[str]:
        """Find the ``llama-server`` binary.

        Priority:
        1. ``settings.llamacpp_binary_path`` (explicit override)
        2. ``llama-server`` on PATH
        3. ``llama.cpp/build/bin/llama-server`` relative to cwd
        """
        explicit: Optional[str] = getattr(settings, "llamacpp_binary_path", None)
        if explicit and os.path.isfile(explicit):
            return explicit

        on_path = shutil.which("llama-server")
        if on_path:
            return on_path

        # Common build location
        for candidate in (
            os.path.join("llama.cpp", "build", "bin", "llama-server"),
            os.path.join("llama.cpp", "build", "bin", "llama-server.exe"),
        ):
            if os.path.isfile(candidate):
                return os.path.abspath(candidate)

        return None

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def _build_cmd(self, config: dict, binary: str) -> list[str]:
        host = config.get("host", "127.0.0.1")
        port = config.get("port", 8081)
        ctx_size = config.get("ctx_size", config.get("context_length", 4096))
        n_gpu_layers = config.get("n_gpu_layers", -1)
        threads = config.get("threads", os.cpu_count() or 4)

        cmd = [
            binary,
            "--host", host,
            "--port", str(port),
        ]

        # Single model vs router (models-dir) mode
        models_dir = config.get("models_dir")
        model_path = config.get("model_path", config.get("model", ""))

        if models_dir and os.path.isdir(models_dir):
            cmd.extend(["--models-dir", models_dir])
            self._log_lines.append(f"[INFO] Router mode: serving all models in {models_dir}")
        elif model_path:
            cmd.extend(["--model", model_path])
        else:
            self._log_lines.append("[WARN] No --model or --models-dir specified")

        cmd.extend(["--ctx-size", str(ctx_size)])
        cmd.extend(["--n-gpu-layers", str(n_gpu_layers)])
        cmd.extend(["--threads", str(threads)])

        # Optional flags
        if config.get("flash_attn"):
            cmd.append("--flash-attn")
        if config.get("cont_batching", True):
            cmd.append("--cont-batching")
        if config.get("mlock"):
            cmd.append("--mlock")
        if config.get("embedding"):
            cmd.append("--embedding")
        if config.get("verbose"):
            cmd.append("--verbose")

        # Extra args passthrough
        extra = config.get("extra_args", {})
        for k, v in extra.items():
            flag = f"--{k.replace('_', '-')}"
            if flag in cmd:
                continue
            if isinstance(v, bool):
                if v:
                    cmd.append(flag)
            else:
                cmd.extend([flag, str(v)])

        # Raw custom args passthrough
        custom_args = config.get("custom_args")
        if custom_args:
            import shlex
            try:
                parsed_args = shlex.split(custom_args)
                cmd.extend(parsed_args)
            except Exception as e:
                self._log_lines.append(f"[WARN] Failed to parse custom_args: {e}")

        return cmd

    # ------------------------------------------------------------------
    # Output reader
    # ------------------------------------------------------------------

    async def _read_output(self) -> None:
        async def read_stream(stream, prefix: str) -> None:
            while True:
                line = await stream.readline()
                if not line:
                    break
                decoded = line.decode(errors="replace").rstrip()
                self._log_lines.append(f"[{prefix}] {decoded}")
                lower = decoded.lower()
                if "listening" in lower or "ready" in lower:
                    self._health_status = "healthy"
                if "error" in lower or "failed" in lower:
                    self._health_status = "error"

        if self._process and self._process.stdout:
            await asyncio.gather(
                read_stream(self._process.stdout, "OUT"),
                read_stream(self._process.stderr, "ERR"),
            )

        if (
            self._process
            and self._process.returncode is not None
            and self._process.returncode != 0
        ):
            self._log_lines.append(
                f"[ERROR] Process exited with code {self._process.returncode}"
            )
            self._health_status = "error"

    # ------------------------------------------------------------------
    # BackendProvider interface
    # ------------------------------------------------------------------

    async def start(self, config: dict) -> dict:
        if self.is_running:
            return {"status": "error", "message": "Server is already running"}

        self._current_config = config
        self._log_lines = []

        binary = self._resolve_binary()
        if not binary:
            msg = (
                "llama-server binary not found. Set llamacpp_binary_path in settings, "
                "install llama-server to PATH, or build llama.cpp locally."
            )
            self._log_lines.append(f"[ERROR] {msg}")
            return {"status": "error", "message": msg}

        cmd = self._build_cmd(config, binary)
        self._log_lines.append(f"[CMD] {' '.join(cmd)}")

        env = os.environ.copy()
        if settings.huggingface_token:
            env["HF_TOKEN"] = settings.huggingface_token

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except FileNotFoundError as e:
            msg = f"Failed to start: binary not found at {binary}. Error: {e}"
            self._log_lines.append(f"[ERROR] {msg}")
            return {"status": "error", "message": msg}
        except Exception as e:
            msg = f"Failed to start llama-server: {e}"
            self._log_lines.append(f"[ERROR] {msg}")
            return {"status": "error", "message": msg}

        self._start_time = time.time()
        asyncio.create_task(self._read_output())

        # Catch immediate crashes
        await asyncio.sleep(1.0)
        if self._process.returncode is not None:
            msg = f"Process exited immediately with code {self._process.returncode}"
            self._log_lines.append(f"[ERROR] {msg}")
            return {"status": "error", "message": msg, "logs": self._log_lines[-10:]}

        return {
            "status": "started",
            "pid": self._process.pid,
            "command": " ".join(cmd),
        }

    async def stop(self) -> dict:
        if not self.is_running:
            return {"status": "error", "message": "Server is not running"}

        if self._process:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                self._process.kill()
                await self._process.wait()

        self._process = None
        self._start_time = None
        self._health_status = "stopped"
        return {"status": "stopped"}

    async def restart(self, config: Optional[dict] = None) -> dict:
        await self.stop()
        await asyncio.sleep(1)
        cfg = config or self._current_config
        return await self.start(cfg)

    async def get_status(self) -> dict:
        if self.is_running:
            return {
                "running": True,
                "model_path": self._current_config.get(
                    "model_path", self._current_config.get("model", "")
                ),
                "host": self._current_config.get("host", "127.0.0.1"),
                "port": self._current_config.get("port", 8081),
                "pid": self.pid,
                "uptime_seconds": self.uptime,
                "health": self._health_status,
            }
        return {"running": False, "health": "stopped"}

    async def get_logs(self, cursor: int = 0) -> dict:
        return {
            "lines": self._log_lines[cursor:],
            "cursor": len(self._log_lines),
        }

    async def health_check(self) -> dict:
        host = self._current_config.get("host", "127.0.0.1")
        port = self._current_config.get("port", 8081)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"http://{host}:{port}/health")
                if r.status_code == 200:
                    self._health_status = "healthy"
                    return {"status": "healthy", "detail": r.json()}
        except Exception as e:
            self._health_status = "unreachable"
            return {"status": "unreachable", "detail": str(e)}
        return {"status": "unknown"}

    async def get_model_info(self) -> dict:
        host = self._current_config.get("host", "127.0.0.1")
        port = self._current_config.get("port", 8081)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # llama.cpp uses the OpenAI-compatible /v1/models endpoint
                r = await client.get(f"http://{host}:{port}/v1/models")
                if r.status_code == 200:
                    return r.json()
        except Exception:
            return {}
        return {}
