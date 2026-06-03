import asyncio
import json
import os
import signal
import time
from typing import Optional

import httpx
from app.config import settings


class ServerManager:
    def __init__(self):
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

    async def start(self, config: dict) -> dict:
        if self.is_running:
            return {"status": "error", "message": "Server is already running"}

        self._current_config = config
        self._log_lines = []

        model_path = config.get("model_path", "")
        host = config.get("host", settings.sglang_default_host)
        port = config.get("port", settings.sglang_default_port)
        tp = config.get("tensor_parallel_size", 1)

        cmd = [
            "python3", "-m", "sglang.launch_server",
            "--model-path", model_path,
            "--host", host,
            "--port", str(port),
            "--tensor-parallel-size", str(tp),
        ]

        if config.get("enable_multimodal"):
            cmd.append("--enable-multimodal")
        if config.get("trust_remote_code"):
            cmd.append("--trust-remote-code")
        if config.get("quantization"):
            cmd.extend(["--quantization", config["quantization"]])
        if config.get("dtype"):
            cmd.extend(["--dtype", config["dtype"]])
        if config.get("context_length"):
            cmd.extend(["--context-length", str(config["context_length"])])

        extra = config.get("extra_args", {})
        for k, v in extra.items():
            flag = f"--{k.replace('_', '-')}"
            if isinstance(v, bool):
                if v:
                    cmd.append(flag)
            else:
                cmd.extend([flag, str(v)])

        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        self._start_time = time.time()
        asyncio.create_task(self._read_output())

        return {
            "status": "started",
            "pid": self._process.pid,
            "command": " ".join(cmd),
        }

    async def _read_output(self):
        async def read_stream(stream, prefix: str):
            while True:
                line = await stream.readline()
                if not line:
                    break
                decoded = line.decode(errors="replace").rstrip()
                self._log_lines.append(f"[{prefix}] {decoded}")
                if "health" in decoded.lower() or "ready" in decoded.lower():
                    self._health_status = "healthy"

        if self._process and self._process.stdout:
            await asyncio.gather(
                read_stream(self._process.stdout, "OUT"),
                read_stream(self._process.stderr, "ERR"),
            )

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
                r = await client.get(f"http://{host}:{port}/health")
                if r.status_code == 200:
                    self._health_status = "healthy"
                    return {"status": "healthy", "detail": r.json()}
        except Exception as e:
            self._health_status = "unreachable"
            return {"status": "unreachable", "detail": str(e)}
        return {"status": "unknown"}

    async def get_model_info(self) -> dict:
        host = self._current_config.get("host", settings.sglang_default_host)
        port = self._current_config.get("port", settings.sglang_default_port)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"http://{host}:{port}/get_model_info")
                if r.status_code == 200:
                    return r.json()
        except Exception:
            return {}
        return {}


server_manager = ServerManager()
