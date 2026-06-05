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

        # Find Python inside the active venv
        import sys
        import shutil
        if hasattr(sys, 'prefix') and sys.prefix != getattr(sys, 'base_prefix', sys.prefix):
            python_cmd = os.path.join(sys.prefix, 'bin', 'python')
        else:
            python_cmd = shutil.which("python3") or shutil.which("python") or sys.executable

        # Pre-flight: verify sglang.launch_server can actually be loaded
        check = await asyncio.create_subprocess_exec(
            python_cmd, "-c", "from sglang.launch_server import launch_server; print('ok')",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await check.communicate()
        if check.returncode != 0:
            err = stderr.decode(errors="replace").strip()
            # Auto-fix kernels/transformers incompat (non-blocking, with timeout)
            if "kernels" in err or "LayerRepository" in err or "revision or a version" in err or "Lfm2VlConfig" in err or "cannot import name" in err:
                self._log_lines.append(f"[WARN] Detected transformers/kernels incompat, auto-fixing (timeout 60s)...")
                # Upgrade both transformers and kernels to compatible versions
                fix_cmd = [python_cmd, "-m", "pip", "install", "--quiet", "--no-warn-script-location", "--upgrade", "transformers>=4.56", "kernels>=0.10.0"]
                try:
                    fix = await asyncio.create_subprocess_exec(
                        *fix_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    try:
                        _, _ = await asyncio.wait_for(fix.communicate(), timeout=60.0)
                    except asyncio.TimeoutError:
                        fix.kill()
                        msg = f"Auto-fix timed out after 60s. Run manually:\n  {python_cmd} -m pip install --upgrade 'transformers>=4.56' 'kernels>=0.10.0'"
                        self._log_lines.append(f"[ERROR] {msg}")
                        return {"status": "error", "message": msg}
                    # Retry with the full launch_server import
                    check2 = await asyncio.create_subprocess_exec(
                        python_cmd, "-c", "from sglang.launch_server import launch_server; print('ok')",
                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                    )
                    stdout2, stderr2 = await check2.communicate()
                    if check2.returncode != 0:
                        fix_err = stderr2.decode(errors="replace").strip()
                        msg = f"Auto-fix did not resolve. Run manually:\n  {python_cmd} -m pip install --upgrade 'transformers>=4.56' 'kernels>=0.10.0'\n\nError: {fix_err[:300]}"
                        self._log_lines.append(f"[ERROR] {msg}")
                        return {"status": "error", "message": msg}
                    self._log_lines.append(f"[OK] Auto-fixed. sglang ready.")
                except Exception as e:
                    msg = f"Auto-fix crashed: {e}. Run manually:\n  {python_cmd} -m pip install --upgrade 'transformers>=4.56' 'kernels>=0.10.0'"
                    self._log_lines.append(f"[ERROR] {msg}")
                    return {"status": "error", "message": msg}
            else:
                msg = f"sglang not installed in {python_cmd}: {err}\n\nInstall with: {python_cmd} -m pip install sglang"
                self._log_lines.append(f"[ERROR] {msg}")
                return {"status": "error", "message": msg}

        cmd = [
            python_cmd, "-m", "sglang.launch_server",
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

        self._log_lines.append(f"[CMD] {' '.join(cmd)}")

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as e:
            msg = f"Failed to start: Python executable not found at {python_cmd}. Error: {e}"
            self._log_lines.append(f"[ERROR] {msg}")
            return {"status": "error", "message": msg}
        except Exception as e:
            msg = f"Failed to start server: {e}"
            self._log_lines.append(f"[ERROR] {msg}")
            return {"status": "error", "message": msg}

        self._start_time = time.time()
        asyncio.create_task(self._read_output())

        # Wait briefly to catch immediate crashes
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
                if "error" in decoded.lower() or "traceback" in decoded.lower():
                    self._health_status = "error"

        if self._process and self._process.stdout:
            await asyncio.gather(
                read_stream(self._process.stdout, "OUT"),
                read_stream(self._process.stderr, "ERR"),
            )

        if self._process and self._process.returncode is not None and self._process.returncode != 0:
            self._log_lines.append(f"[ERROR] Process exited with code {self._process.returncode}")
            self._health_status = "error"

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
