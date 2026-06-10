"""SGLang backend — manages a ``python -m sglang.launch_server`` subprocess.

Refactored from the original monolithic ``ServerManager``.  All smart
fixes (AWQ dtype, CPU-offload CUDA-graph, OOM hints, auto-fix) are
preserved.  Hardcoded paths replaced with ``settings`` / auto-detection.
"""

import asyncio
import os
import shutil
import sys
import time
from typing import Optional

import httpx

from app.config import settings
from app.services.backends.base import BackendProvider, BackendType


class SglangBackend(BackendProvider):
    backend_type = BackendType.SGLANG

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
    # Environment helpers
    # ------------------------------------------------------------------

    def _resolve_python(self) -> str:
        """Return the Python interpreter inside the active venv."""
        if hasattr(sys, "prefix") and sys.prefix != getattr(sys, "base_prefix", sys.prefix):
            candidate = os.path.join(sys.prefix, "bin", "python")
            if os.path.isfile(candidate):
                return candidate
            # Windows venv layout
            candidate_win = os.path.join(sys.prefix, "Scripts", "python.exe")
            if os.path.isfile(candidate_win):
                return candidate_win
        return shutil.which("python3") or shutil.which("python") or sys.executable

    def _build_env(self, config: dict) -> dict[str, str]:
        """Build the subprocess environment, replacing hardcoded paths."""
        env = os.environ.copy()

        # Disable stdout buffering so logs stream in real-time
        env["PYTHONUNBUFFERED"] = "1"

        # PATH: prepend venv bin + optional CUDA bin
        venv_bin = getattr(settings, "venv_path", None)
        if venv_bin is None and hasattr(sys, "prefix"):
            venv_bin = os.path.join(sys.prefix, "bin")
        cuda_home = getattr(settings, "cuda_home", None)
        if cuda_home is None:
            cuda_home = self._detect_cuda_home()

        path_parts: list[str] = []
        if venv_bin and os.path.isdir(venv_bin):
            path_parts.append(venv_bin)
        if cuda_home:
            cuda_bin = os.path.join(cuda_home, "bin")
            if os.path.isdir(cuda_bin):
                path_parts.append(cuda_bin)
        path_parts.append(env.get("PATH", ""))
        env["PATH"] = os.pathsep.join(path_parts)

        if cuda_home:
            env["CUDA_HOME"] = cuda_home

        # Add pip-installed nvidia package library paths to LD_LIBRARY_PATH
        ld_paths = []
        if hasattr(sys, "prefix"):
            lib_dir = os.path.join(sys.prefix, "lib")
            if os.path.isdir(lib_dir):
                for py_dir in os.listdir(lib_dir):
                    if py_dir.startswith("python"):
                        sp_dir = os.path.join(lib_dir, py_dir, "site-packages")
                        if os.path.isdir(sp_dir):
                            nvidia_dir = os.path.join(sp_dir, "nvidia")
                            if os.path.isdir(nvidia_dir):
                                for pkg in os.listdir(nvidia_dir):
                                    pkg_lib = os.path.join(nvidia_dir, pkg, "lib")
                                    if os.path.isdir(pkg_lib):
                                        ld_paths.append(pkg_lib)

        current_ld = env.get("LD_LIBRARY_PATH", "")
        if current_ld:
            ld_paths.append(current_ld)
        if ld_paths:
            env["LD_LIBRARY_PATH"] = os.pathsep.join(ld_paths)

        env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

        if settings.huggingface_token:
            env["HF_TOKEN"] = settings.huggingface_token

        if config.get("speculative_algorithm"):
            env["SGLANG_ENABLE_SPEC_V2"] = "1"

        # Merge extra env vars from settings if present
        extra_env: dict = getattr(settings, "sglang_extra_env", None) or {}
        env.update(extra_env)

        return env

    @staticmethod
    def _detect_cuda_home() -> Optional[str]:
        """Best-effort CUDA home detection from nvidia-smi or known paths."""
        nvidia_smi = shutil.which("nvidia-smi")
        if nvidia_smi:
            cuda_dir = os.path.dirname(os.path.dirname(nvidia_smi))
            if os.path.isdir(cuda_dir):
                return cuda_dir
        for candidate in ("/usr/local/cuda", "/usr/local/cuda-12"):
            if os.path.isdir(candidate):
                return candidate
        return None

    # ------------------------------------------------------------------
    # Command builder
    # ------------------------------------------------------------------

    def _build_cmd(self, config: dict, python_cmd: str) -> list[str]:
        """Translate *config* into the ``sglang.launch_server`` CLI argv."""
        model_path = config.get("model_path", "")
        host = config.get("host", settings.sglang_default_host)
        port = config.get("port", settings.sglang_default_port)
        tp = config.get("tensor_parallel_size", 1)

        cmd = [
            python_cmd, "-m", "sglang.launch_server",
            "--model-path", model_path,
            "--host", host,
            "--port", str(port),
            "--tensor-parallel-size", str(tp),
        ]

        quant = config.get("quantization", "")
        dtype = config.get("dtype", "auto")

        # AWQ only supports float16
        if quant and quant != "auto" and "awq" in quant.lower():
            if dtype in ("auto", "bfloat16", "bf16"):
                dtype = "float16"
                self._log_lines.append("[FIX] AWQ requires float16, forced --dtype float16")

        # Boolean flags
        _bool_flags = {
            "enable_multimodal": "--enable-multimodal",
            "trust_remote_code": "--trust-remote-code",
            "enable_ep_moe": "--enable-ep-moe",
            "is_embedding": "--is-embedding",
            "enable_dp_attention": "--enable-dp-attention",
        }
        for key, flag in _bool_flags.items():
            if config.get(key):
                cmd.append(flag)

        # Key-value flags
        _kv_flags = {
            "quantization": "--quantization",
            "context_length": "--context-length",
            "tool_call_parser": "--tool-call-parser",
            "reasoning_parser": "--reasoning-parser",
            "chat_template": "--chat-template",
            "grammar_backend": "--grammar-backend",
            "load_format": "--load-format",
            "log_level": "--log-level",
            "kv_cache_dtype": "--kv-cache-dtype",
        }
        for key, flag in _kv_flags.items():
            val = config.get(key)
            if key == "quantization" and val and val != "auto":
                cmd.extend([flag, val])
            elif key != "quantization" and val:
                cmd.extend([flag, str(val)])

        if dtype:
            cmd.extend(["--dtype", dtype])

        # Memory optimization
        if config.get("mem_fraction_static") is not None:
            cmd.extend(["--mem-fraction-static", str(config["mem_fraction_static"])])
        if config.get("cpu_offload_gb") is not None and config["cpu_offload_gb"] > 0:
            cmd.extend(["--cpu-offload-gb", str(int(config["cpu_offload_gb"]))])
            if not config.get("disable_cuda_graph"):
                cmd.append("--disable-cuda-graph")
                self._log_lines.append(
                    "[FIX] CPU offload active — CUDA graphs auto-disabled "
                    "(offloader has tied-weights conflict)"
                )
        if config.get("disable_cuda_graph"):
            if "--disable-cuda-graph" not in cmd:
                cmd.append("--disable-cuda-graph")
        if config.get("max_running_requests") is not None and config["max_running_requests"] > 0:
            cmd.extend(["--max-running-requests", str(config["max_running_requests"])])

        # MoE
        if config.get("ep_size") is not None and config["ep_size"] > 1:
            cmd.extend(["--expert-parallel-size", str(config["ep_size"])])
        if config.get("moe_runner_backend"):
            cmd.extend(["--moe-runner-backend", config["moe_runner_backend"]])

        # Speculative decoding / MTP
        spec_algo = config.get("speculative_algorithm")
        if spec_algo:
            cmd.extend(["--speculative-algorithm", spec_algo])
            if config.get("speculative_num_steps") is not None:
                cmd.extend(["--speculative-num-steps", str(config["speculative_num_steps"])])
            if config.get("speculative_draft_model_path"):
                cmd.extend(["--speculative-draft-model-path", config["speculative_draft_model_path"]])
            
            # speculative_eagle_topk handling
            eagle_topk = config.get("speculative_eagle_topk")
            if eagle_topk is not None:
                cmd.extend(["--speculative-eagle-topk", str(eagle_topk)])
            elif spec_algo.upper() == "EAGLE":
                # EAGLE validation bug bypass: default to 1 if not defined elsewhere
                has_eagle_topk = (
                    "speculative_eagle_topk" in config.get("extra_args", {})
                    or (config.get("custom_args") and "--speculative-eagle-topk" in config["custom_args"])
                )
                if not has_eagle_topk:
                    cmd.extend(["--speculative-eagle-topk", "1"])
                    self._log_lines.append("[FIX] Auto-injected --speculative-eagle-topk 1 for EAGLE algorithm")
            
            cmd.extend(["--mamba-scheduler-strategy", "extra_buffer"])

        # Pipeline parallelism
        if config.get("pp_size") is not None and config["pp_size"] > 1:
            cmd.extend(["--pipeline-parallel-size", str(config["pp_size"])])

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

        # Always enable metrics
        if "--enable-metrics" not in cmd:
            cmd.append("--enable-metrics")

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
    # Diagnostics pre-flight
    # ------------------------------------------------------------------

    async def _preflight(self, python_cmd: str) -> Optional[dict]:
        """Run diagnostics and attempt auto-fix.  Returns error dict or None."""
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
            diag = await self._try_autofix(diag, python_cmd)

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

        return None

    async def _try_autofix(
        self, diag, python_cmd: str
    ):
        """Attempt one-shot auto-fix for sglang/transformers/kernels issues."""
        from app.services.diagnostics import run_full_diagnostics

        sglang_check = next(
            (c for c in diag.checks if c["name"] == "sglang installation"), None
        )
        if not sglang_check or sglang_check["ok"]:
            return diag

        fix_sug = sglang_check.get("fix", "")
        prefix = f"{python_cmd} -m pip install "
        if not fix_sug or not fix_sug.startswith(prefix):
            msg = f"Cannot auto-fix. Run: {fix_sug}"
            self._log_lines.append(f"[ERROR] {msg}")
            return diag

        args_str = fix_sug[len(prefix):].strip()
        import shlex
        args = shlex.split(args_str)

        self._log_lines.append(
            f"[WARN] Attempting one-shot auto-fix: pip install {args_str}..."
        )
        try:
            fix = await asyncio.create_subprocess_exec(
                python_cmd, "-m", "pip", "install", "--quiet",
                "--no-warn-script-location",
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                await asyncio.wait_for(fix.communicate(), timeout=90.0)
            except asyncio.TimeoutError:
                fix.kill()
            diag = await run_full_diagnostics(python_cmd)
            if diag.can_run:
                self._log_lines.append("[OK] Auto-fix succeeded")
            else:
                msg = (
                    f"Auto-fix did not resolve. Run:\n  {fix_sug}\n\n"
                    "Then check:\n  GET /api/v1/diagnostics/"
                )
                self._log_lines.append(f"[ERROR] {msg}")
        except Exception as e:
            self._log_lines.append(f"[WARN] Auto-fix crashed: {e}")

        return diag

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
                if "health" in lower or "ready" in lower:
                    self._health_status = "healthy"
                if "error" in lower or "traceback" in lower:
                    self._health_status = "error"
                if "out of memory" in lower or "cuda out of memory" in lower:
                    self._log_lines.append("[HINT] OOM detected! Suggestions:")
                    self._log_lines.append("[HINT]   1. Reduce --mem-fraction-static (try 0.80 or 0.75)")
                    self._log_lines.append("[HINT]   2. Enable --kv-cache-dtype fp8_e4m3 (2x more context)")
                    self._log_lines.append("[HINT]   3. Reduce --cuda-graph-max-batch-size")
                    self._log_lines.append("[HINT]   4. Add --cpu-offload-gb 5 (offload 5GB to CPU)")
                    self._log_lines.append("[HINT]   5. Reduce --max-running-requests")

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

        python_cmd = self._resolve_python()

        # Pre-flight diagnostics
        err = await self._preflight(python_cmd)
        if err is not None:
            return err

        cmd = self._build_cmd(config, python_cmd)
        self._log_lines.append(f"[CMD] {' '.join(cmd)}")

        env = self._build_env(config)

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
