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

        # Pre-flight: full diagnostics check
        from app.services.diagnostics import run_full_diagnostics
        diag = await run_full_diagnostics(python_cmd)

        for check in diag.checks:
            if check["ok"]:
                self._log_lines.append(f"[CHECK] ✓ {check['name']}: {check['message']}")
            elif check["severity"] == "warning":
                self._log_lines.append(f"[CHECK] ⚠ {check['name']}: {check['message']}")
            else:
                self._log_lines.append(f"[CHECK] ✗ {check['name']}: {check['message']}")

        if not diag.can_run:
            # Try one-shot auto-fix for transformers/kernels (most common issue)
            sglang_check = next((c for c in diag.checks if c["name"] == "sglang installation"), None)
            if sglang_check and not sglang_check["ok"]:
                fix_sug = sglang_check.get("fix", "")
                if "transformers" in fix_sug and "kernels" in fix_sug:
                    self._log_lines.append(f"[WARN] Attempting one-shot auto-fix (transformers 5.6.0 + kernels 0.10.0)...")
                    try:
                        fix = await asyncio.create_subprocess_exec(
                            python_cmd, "-m", "pip", "install", "--quiet", "--no-warn-script-location",
                            "transformers==5.6.0", "kernels==0.10.0",
                            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                        )
                        try:
                            _, _ = await asyncio.wait_for(fix.communicate(), timeout=90.0)
                        except asyncio.TimeoutError:
                            fix.kill()
                        # Re-check
                        diag = await run_full_diagnostics(python_cmd)
                        if diag.can_run:
                            self._log_lines.append(f"[OK] Auto-fix succeeded")
                        else:
                            msg = f"Auto-fix did not resolve. Run:\n  {fix_sug}\n\nThen check:\n  GET /api/v1/diagnostics/"
                            self._log_lines.append(f"[ERROR] {msg}")
                            return {"status": "error", "message": msg, "diagnostics": diag.to_dict()}
                    except Exception as e:
                        self._log_lines.append(f"[WARN] Auto-fix crashed: {e}")
                else:
                    msg = f"Cannot auto-fix. Run: {fix_sug}"
                    self._log_lines.append(f"[ERROR] {msg}")
                    return {"status": "error", "message": msg, "diagnostics": diag.to_dict()}

            if not diag.can_run:
                err_lines = ["System not ready to launch sglang:"]
                for err in diag.errors:
                    err_lines.append(f"  • {err}")
                err_lines.append("")
                err_lines.append("Get full report: GET /api/v1/diagnostics/")
                err_lines.append("Auto-fix: POST /api/v1/diagnostics/fix/{check_name} (admin only)")
                err_lines.append("")
                err_lines.append("Quick fixes:")
                for sug in diag.fix_suggestions:
                    err_lines.append(f"  {sug}")
                msg = "\n".join(err_lines)
                self._log_lines.append(f"[ERROR] {msg}")
                return {"status": "error", "message": msg, "diagnostics": diag.to_dict()}

        cmd = [
            python_cmd, "-m", "sglang.launch_server",
            "--model-path", model_path,
            "--host", host,
            "--port", str(port),
            "--tensor-parallel-size", str(tp),
        ]

        quant = config.get("quantization", "")
        dtype = config.get("dtype", "auto")

        # AWQ only supports float16, force it if dtype is auto or bfloat16
        if quant and quant != "auto" and "awq" in quant.lower():
            if dtype in ("auto", "bfloat16", "bf16"):
                dtype = "float16"
                self._log_lines.append("[FIX] AWQ requires float16, forced --dtype float16")

        if config.get("enable_multimodal"):
            cmd.append("--enable-multimodal")
        if config.get("trust_remote_code"):
            cmd.append("--trust-remote-code")
        if quant and quant != "auto":
            cmd.extend(["--quantization", quant])
        if dtype:
            cmd.extend(["--dtype", dtype])
        if config.get("context_length"):
            cmd.extend(["--context-length", str(config["context_length"])])

        if config.get("tool_call_parser"):
            cmd.extend(["--tool-call-parser", config["tool_call_parser"]])
        if config.get("reasoning_parser"):
            cmd.extend(["--reasoning-parser", config["reasoning_parser"]])
        if config.get("chat_template"):
            cmd.extend(["--chat-template", config["chat_template"]])
        if config.get("grammar_backend"):
            cmd.extend(["--grammar-backend", config["grammar_backend"]])
        if config.get("load_format"):
            cmd.extend(["--load-format", config["load_format"]])
        if config.get("enable_ep_moe"):
            cmd.append("--enable-ep-moe")
        if config.get("is_embedding"):
            cmd.append("--is-embedding")
        if config.get("log_level"):
            cmd.extend(["--log-level", config["log_level"]])

        # Memory optimization
        if config.get("kv_cache_dtype"):
            cmd.extend(["--kv-cache-dtype", config["kv_cache_dtype"]])
        if config.get("mem_fraction_static") is not None:
            cmd.extend(["--mem-fraction-static", str(config["mem_fraction_static"])])
        if config.get("cpu_offload_gb") is not None and config["cpu_offload_gb"] > 0:
            cmd.extend(["--cpu-offload-gb", str(int(config["cpu_offload_gb"]))])
        if config.get("disable_cuda_graph"):
            cmd.append("--disable-cuda-graph")
        if config.get("max_running_requests") is not None and config["max_running_requests"] > 0:
            cmd.extend(["--max-running-requests", str(config["max_running_requests"])])

        # MoE
        if config.get("ep_size") is not None and config["ep_size"] > 1:
            cmd.extend(["--expert-parallel-size", str(config["ep_size"])])
        if config.get("moe_runner_backend"):
            cmd.extend(["--moe-runner-backend", config["moe_runner_backend"]])
        if config.get("enable_dp_attention"):
            cmd.append("--enable-dp-attention")

        # Speculative decoding / MTP
        if config.get("speculative_algorithm"):
            cmd.extend(["--speculative-algorithm", config["speculative_algorithm"]])
            if config.get("speculative_num_steps") is not None:
                cmd.extend(["--speculative-num-steps", str(config["speculative_num_steps"])])
            if config.get("speculative_draft_model_path"):
                cmd.extend(["--speculative-draft-model-path", config["speculative_draft_model_path"]])

        # Pipeline parallelism
        if config.get("pp_size") is not None and config["pp_size"] > 1:
            cmd.extend(["--pipeline-parallel-size", str(config["pp_size"])])

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

        if "--enable-metrics" not in cmd:
            cmd.append("--enable-metrics")

        self._log_lines.append(f"[CMD] {' '.join(cmd)}")

        env = os.environ.copy()
        env["PATH"] = "/home/caio/sglang-commander/.venv/bin:/home/caio/.local/lib/python3.12/site-packages/nvidia/cu13/bin:" + env.get("PATH", "")
        env["CUDA_HOME"] = "/home/caio/.local/lib/python3.12/site-packages/nvidia/cu13"
        env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
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
                if "out of memory" in decoded.lower() or "cuda out of memory" in decoded.lower():
                    self._log_lines.append("[HINT] OOM detected! Suggestions:")
                    self._log_lines.append("[HINT]   1. Reduce --mem-fraction-static (current: try 0.80 or 0.75)")
                    self._log_lines.append("[HINT]   2. Enable --kv-cache-dtype fp8_e4m3 (2x more context)")
                    self._log_lines.append("[HINT]   3. Reduce --cuda-graph-max-batch-size")
                    self._log_lines.append("[HINT]   4. Add --cpu-offload-gb 5 (offload 5GB to CPU)")
                    self._log_lines.append("[HINT]   5. Reduce --max-running-requests")

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
