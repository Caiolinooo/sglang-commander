"""System diagnostics for sglang server requirements.

Checks all known failure points before attempting to launch sglang:
- Python version
- sglang installation + version + deep imports (full traceback)
- transformers / kernels / torch versions
- PyTorch installation and accelerator (CUDA / ROCm / MPS) support
- GPU availability + VRAM
- FlashAttention / triton
- Disk space, RAM
"""
import asyncio
import shutil
from typing import Optional



class DiagnosticResult:
    def __init__(self):
        self.checks: list[dict] = []
        self.can_run: bool = True
        self.warnings: list[str] = []
        self.errors: list[str] = []
        self.fix_suggestions: list[str] = []
        self.versions: dict[str, str] = {}
        self.full_errors: dict[str, str] = {}

    def add_check(self, name: str, ok: bool, message: str, fix: Optional[str] = None,
                  severity: str = "info", full_error: Optional[str] = None):
        entry: dict = {"name": name, "ok": ok, "message": message, "severity": severity}
        if fix:
            entry["fix"] = fix
        self.checks.append(entry)
        if full_error and not ok:
            self.full_errors[name] = full_error
            entry["full_error"] = full_error
        if not ok:
            if severity == "error":
                self.errors.append(f"{name}: {message}")
                self.can_run = False
            elif severity == "warning":
                self.warnings.append(f"{name}: {message}")
        if fix and not ok and severity == "error":
            self.fix_suggestions.append(fix)

    def to_dict(self) -> dict:
        return {
            "can_run": self.can_run,
            "checks": self.checks,
            "errors": self.errors,
            "warnings": self.warnings,
            "fix_suggestions": self.fix_suggestions,
            "versions": self.versions,
        }


async def run_full_diagnostics(python_cmd: str) -> DiagnosticResult:
    """Run all diagnostics and return a structured result."""
    result = DiagnosticResult()

    py_ok, py_msg, py_fix = await _check_python_version(python_cmd)
    result.add_check("Python version", py_ok, py_msg, py_fix, "error" if not py_ok else "info")

    sg_ok, sg_msg, sg_fix, sg_full = await _check_sglang_imports(python_cmd)
    result.add_check("sglang installation", sg_ok, sg_msg, sg_fix,
                     "error" if not sg_ok else "info", full_error=sg_full)

    if not sg_ok:
        return result

    # transformers / kernels versions
    for mod, name in [("transformers", "transformers"), ("kernels", "kernels")]:
        ok, msg = await _get_pkg_version(python_cmd, mod, name)
        result.versions[name] = msg
        if not ok:
            result.add_check(f"{name} version", False, msg,
                             f"{python_cmd} -m pip install {name}", "error")

    # PyTorch
    torch_ok, torch_msg, torch_fix = await _check_torch(python_cmd)
    result.versions["torch"] = torch_msg.replace("PyTorch ", "") if torch_ok else "missing"
    result.add_check("PyTorch", torch_ok, torch_msg, torch_fix, "error" if not torch_ok else "info")

    # Accelerator / GPU
    acc_ok, acc_msg, acc_fix, acc_has = await _check_accelerator(python_cmd)
    result.add_check("Accelerator (GPU)", acc_ok, acc_msg, acc_fix, "warning" if not acc_ok else "info")

    if not acc_has:
        result.add_check(
            "GPU", False,
            "No GPU detected. sglang requires a GPU (won't work on CPU).",
            "Run on a machine with a supported GPU (NVIDIA CUDA, AMD ROCm, Apple MPS).", "error"
        )
        return result

    vram_ok, vram_msg, vram_fix = await _check_vram(python_cmd)
    result.add_check("GPU VRAM", vram_ok, vram_msg, vram_fix, "warning" if not vram_ok else "info")

    for mod, name in [("flash_attn", "flash-attn"), ("triton", "triton")]:
        ok, msg, fix = await _check_optional(python_cmd, mod, name)
        result.add_check(f"{name} (optional)", ok, msg, fix, "warning" if not ok else "info")

    disk_ok, disk_msg, disk_fix = _check_disk_space()
    result.add_check("Disk space", disk_ok, disk_msg, disk_fix, "warning" if not disk_ok else "info")

    ram_ok, ram_msg, ram_fix = _check_memory()
    result.add_check("System RAM", ram_ok, ram_msg, ram_fix, "warning" if not ram_ok else "info")

    return result


async def _check_python_version(python_cmd: str) -> tuple[bool, str, Optional[str]]:
    try:
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c",
            "import sys; print(sys.version_info.major, sys.version_info.minor, sys.executable)",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            return False, "Could not determine Python version", None
        parts = stdout.decode().strip().split()
        major, minor = int(parts[0]), int(parts[1])
        if major < 3 or (major == 3 and minor < 10):
            return False, f"Python {major}.{minor} too old (need 3.10+)", "Install Python 3.10 or newer"
        return True, f"Python {major}.{minor}", None
    except Exception as e:
        return False, f"Error: {e}", None


async def _check_sglang_imports(python_cmd: str) -> tuple[bool, str, Optional[str], Optional[str]]:
    """Test sglang installation by importing the full launch_server module.

    Returns (ok, message, fix_command_or_None, full_stderr).
    """
    try:
        # Step 1: get sglang version + path
        ver_proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c", "import sglang; print(sglang.__version__); print(sglang.__file__)",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        ver_out, ver_err = await ver_proc.communicate()
        sglang_version = "unknown"
        if ver_proc.returncode == 0:
            lines = ver_out.decode().strip().split("\n")
            if len(lines) >= 1:
                sglang_version = lines[0]
        else:
            # sglang not importable at all
            err = ver_err.decode(errors="replace").strip()
            if "ModuleNotFoundError" in err and "sglang" in err:
                return False, "sglang not installed", f"{python_cmd} -m pip install sglang", err
            return False, f"sglang import failed: {err[:300]}", f"{python_cmd} -m pip install --force-reinstall sglang", err

        # Step 2: deep import test
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c",
            "import sglang; from sglang.launch_server import run_server; from sglang.srt.server_args import ServerArgs; print('DEEP_OK')",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
        except asyncio.TimeoutError:
            return False, "sglang deep import timed out (30s)", None, "Import hung for 30s — usually a kernel download or network issue"

        if proc.returncode != 0:
            err = stderr.decode(errors="replace").strip()
            fix = _suggest_sglang_fix(err, python_cmd)
            # Build informative message with version + truncated error
            msg = f"sglang {sglang_version} import failed"
            return False, msg, fix, err

        return True, f"sglang {sglang_version}", None, None
    except Exception as e:
        return False, f"Error checking sglang: {e}", None, str(e)


def _suggest_sglang_fix(err: str, python_cmd: str) -> str:
    """Map error patterns to specific fix commands.

    Known-good combo for sglang 0.5.12+: transformers==5.6.0 + kernels>=0.10.0
    """
    err_lower = err.lower()

    if "kernels" in err_lower and ("revision or a version" in err_lower or "LayerRepository" in err_lower):
        return f"{python_cmd} -m pip install transformers==5.6.0"
    if "lfm2vlconfig" in err_lower or "cannot import name" in err_lower:
        return f"{python_cmd} -m pip install transformers==5.6.0"
    if "_apply_hf" in err or "apply_hf" in err_lower or "monkey" in err_lower:
        return f"{python_cmd} -m pip install transformers==5.6.0"
    if "launch_server" in err_lower and "cannot import name" in err_lower:
        return None
    if "modulenotfounderror" in err_lower:
        import re
        m = re.search(r"ModuleNotFoundError: No module named '([^']+)'", err)
        if m:
            return f"{python_cmd} -m pip install {m.group(1)}"
    if "importerror" in err_lower or "attributeerror" in err_lower:
        return f"{python_cmd} -m pip install --force-reinstall --no-deps sglang transformers==5.6.0"

    return f"{python_cmd} -m pip install transformers==5.6.0 sglang"


async def _get_pkg_version(python_cmd: str, module: str, name: str) -> tuple[bool, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c", f"import {module}; print(getattr({module}, '__version__', 'unknown'))",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode == 0:
            return True, stdout.decode().strip()
        return False, f"{name} not installed"
    except Exception as e:
        return False, str(e)


async def _check_torch(python_cmd: str) -> tuple[bool, str, Optional[str]]:
    try:
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c", "import torch; print(torch.__version__)",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            return False, "PyTorch not installed", f"{python_cmd} -m pip install torch"
        return True, f"PyTorch {stdout.decode().strip()}", None
    except Exception as e:
        return False, f"Error: {e}", None


async def _check_accelerator(python_cmd: str) -> tuple[bool, str, Optional[str], bool]:
    """Detect any GPU accelerator: CUDA (NVIDIA), ROCm (AMD), MPS (Apple)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c",
            "import torch; "
            "cuda = torch.cuda.is_available(); "
            "mps = torch.backends.mps.is_available(); "
            "gpus = torch.cuda.device_count(); "
            "name = torch.cuda.get_device_name(0) if cuda else 'none'; "
            "print(f'CUDA:{cuda} MPS:{mps} GPUs:{gpus} Name:{name}')",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            msg = f"PyTorch not found or broken: {stderr.decode()[:150]}"
            return False, msg, f"{python_cmd} -m pip install torch", False

        out = stdout.decode().strip()
        has_cuda = "CUDA:True" in out
        has_mps = "MPS:True" in out
        gpu_count = 0
        gpu_name = "none"

        for line in out.split():
            if line.startswith("GPUs:"):
                try:
                    gpu_count = int(line.split(":")[1])
                except Exception:
                    pass
            if line.startswith("Name:"):
                gpu_name = line.split(":", 1)[1] if ":" in line else "none"

        if has_cuda:
            vendor = "CUDA"
        elif has_mps:
            vendor = "MPS (Apple Silicon)"
        else:
            return False, "PyTorch has no GPU backend (CUDA/MPS). Install the correct torch build.", \
                f"{python_cmd} -m pip install torch --index-url https://download.pytorch.org/whl/cu124", False

        if gpu_count == 0:
            return True, f"{vendor} available but no GPU detected", None, False

        return True, f"{gpu_count} GPU(s) [{vendor}]: {gpu_name}", None, True
    except Exception as e:
        return False, f"Error: {e}", None, False


async def _check_vram(python_cmd: str) -> tuple[bool, str, Optional[str]]:
    try:
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c",
            "import torch; free, total = torch.cuda.mem_get_info(); print(f'{free//1024**3} {total//1024**3}')",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode == 0:
            free, total = map(int, stdout.decode().strip().split())
            if total < 6:
                return False, f"Only {total}GB VRAM (sglang needs 6GB minimum for small models)", \
                    "Use a GPU with more VRAM or a smaller quantized model"
            return True, f"{free}GB free / {total}GB total VRAM", None
    except Exception:
        pass
    return True, "Could not check VRAM", None


async def _check_optional(python_cmd: str, module: str, pkg: str) -> tuple[bool, str, Optional[str]]:
    try:
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c", f"import {module}; print(getattr({module}, '__version__', 'ok'))",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        if proc.returncode == 0:
            return True, f"{pkg} installed", None
        return False, f"{pkg} not installed (optional, recommended)", f"{python_cmd} -m pip install {pkg}"
    except Exception:
        return False, f"{pkg} check failed", None


def _check_disk_space() -> tuple[bool, str, Optional[str]]:
    try:
        usage = shutil.disk_usage("/")
        free_gb = usage.free // (1024 ** 3)
        if free_gb < 20:
            return False, f"Only {free_gb}GB free disk space (need 20GB+ for models)", \
                "Free up disk: rm -rf ~/.cache/huggingface/hub/* (after backing up models)"
        return True, f"{free_gb}GB free disk space", None
    except Exception as e:
        return True, f"Could not check disk space: {e}", None


def _check_memory() -> tuple[bool, str, Optional[str]]:
    try:
        total_gb = 0
        try:
            import psutil
            total_gb = round(psutil.virtual_memory().total / (1024 ** 3))
        except Exception:
            try:
                with open("/proc/meminfo") as f:
                    for line in f:
                        if line.startswith("MemTotal:"):
                            total_kb = int(line.split()[1])
                            total_gb = total_kb // (1024 ** 2)
            except Exception:
                pass
        if total_gb > 0:
            if total_gb < 8:
                return False, f"Only {total_gb}GB RAM (8GB+ recommended)", \
                    "Add more RAM or use a smaller model"
            return True, f"{total_gb}GB RAM", None
    except Exception:
        pass
    return True, "Could not check RAM", None
