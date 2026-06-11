"""vLLM backend — manages a ``python -m vllm.entrypoints.openai.api_server`` subprocess."""

import asyncio
import os
import shutil
import sys
import time
from typing import Optional

import httpx

from app.config import settings
from app.services.backends.base import BackendProvider, BackendType

class VllmBackend(BackendProvider):
    backend_type = BackendType.VLLM

    def __init__(self) -> None:
        self._process: Optional[asyncio.subprocess.Process] = None
        self._log_lines: list[str] = []
        self._start_time: Optional[float] = None
        self._current_config: dict = {}
        self._health_status: str = "unknown"

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

    def _resolve_python(self) -> str:
        if hasattr(sys, "prefix") and sys.prefix != getattr(sys, "base_prefix", sys.prefix):
            candidate = os.path.join(sys.prefix, "bin", "python")
            if os.path.isfile(candidate):
                return candidate
            candidate_win = os.path.join(sys.prefix, "Scripts", "python.exe")
            if os.path.isfile(candidate_win):
                return candidate_win
        return shutil.which("python3") or shutil.which("python") or sys.executable

    def _build_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        if settings.huggingface_token:
            env["HF_TOKEN"] = settings.huggingface_token
        return env

    def _build_cmd(self, config: dict, python_cmd: str) -> list[str]:
        model_path = config.get("model_path", "")
        host = config.get("host", settings.sglang_default_host) # reusing sglang defaults for simplicity
        port = config.get("port", settings.sglang_default_port)
        tp = config.get("tensor_parallel_size", 1)

        cmd = [
            python_cmd, "-m", "vllm.entrypoints.openai.api_server",
            "--model", model_path,
            "--host", host,
            "--port", str(port),
            "--tensor-parallel-size", str(tp),
        ]

        quant = config.get("quantization", "")
        dtype = config.get("dtype", "auto")
        
        if quant and quant != "auto" and quant != "None":
            cmd.extend(["--quantization", quant])
        
        if dtype and dtype != "auto":
            cmd.extend(["--dtype", dtype])

        if config.get("trust_remote_code"):
            cmd.append("--trust-remote-code")

        if config.get("context_length") and config["context_length"] > 0:
            cmd.extend(["--max-model-len", str(config["context_length"])])

        if config.get("mem_fraction_static"):
            cmd.extend(["--gpu-memory-utilization", str(config["mem_fraction_static"])])

        if config.get("enable_multimodal"):
            cmd.extend(["--limit-mm-per-prompt", "image=1"])

        if config.get("custom_args"):
            import shlex
            try:
                cmd.extend(shlex.split(config["custom_args"]))
            except Exception as e:
                self._log_lines.append(f"[WARN] Failed to parse custom_args: {e}")

        return cmd

    async def _read_output(self) -> None:
        async def read_stream(stream, prefix: str) -> None:
            while True:
                line = await stream.readline()
                if not line:
                    break
                decoded = line.decode(errors="replace").rstrip()
                self._log_lines.append(f"[{prefix}] {decoded}")
                lower = decoded.lower()
                if "running on" in lower or "started" in lower:
                    self._health_status = "healthy"
                if "error" in lower or "traceback" in lower:
                    self._health_status = "error"
                if "out of memory" in lower:
                    self._log_lines.append("[HINT] vLLM OOM detected! Try reducing --gpu-memory-utilization.")

        if self._process and self._process.stdout:
            await asyncio.gather(
                read_stream(self._process.stdout, "OUT"),
                read_stream(self._process.stderr, "ERR"),
            )

        if self._process and self._process.returncode is not None and self._process.returncode != 0:
            self._health_status = "error"

    async def start(self, config: dict) -> dict:
        if self.is_running:
            return {"status": "error", "message": "Server is already running"}

        self._current_config = config
        self._log_lines = []
        python_cmd = self._resolve_python()
        cmd = self._build_cmd(config, python_cmd)
        env = self._build_env()

        self._log_lines.append(f"[CMD] {' '.join(cmd)}")

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except Exception as e:
            msg = f"Failed to start vLLM: {e}"
            self._log_lines.append(f"[ERROR] {msg}")
            return {"status": "error", "message": msg}

        self._start_time = time.time()
        asyncio.create_task(self._read_output())

        await asyncio.sleep(1.0)
        if self._process.returncode is not None:
            msg = f"Process exited immediately with code {self._process.returncode}"
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
        return await self.start(config or self._current_config)

    async def get_status(self) -> dict:
        if self.is_running:
            return {
                "running": True,
                "model_path": self._current_config.get("model_path", ""),
                "host": self._current_config.get("host", settings.sglang_default_host),
                "port": self._current_config.get("port", settings.sglang_default_port),
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
        host = self._current_config.get("host", settings.sglang_default_host)
        port = self._current_config.get("port", settings.sglang_default_port)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"http://{host}:{port}/v1/models")
                if r.status_code == 200:
                    self._health_status = "healthy"
                    return {"status": "healthy", "detail": r.json()}
        except Exception as e:
            self._health_status = "unreachable"
            return {"status": "unreachable", "detail": str(e)}
        return {"status": "unknown"}

    async def get_model_info(self) -> dict:
        # vLLM exposes /v1/models
        return await self.health_check()
