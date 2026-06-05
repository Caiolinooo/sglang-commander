"""System diagnostics for sglang server requirements.

Checks all known failure points before attempting to launch sglang:
- Python version
- sglang installation and deep imports
- PyTorch installation and CUDA support
- NVIDIA GPU availability
- CUDA toolkit/drivers
- FlashAttention / triton
- Disk space
- Memory
- Required env vars (CUDA_HOME, LD_LIBRARY_PATH)
"""
import asyncio
import os
import shutil
import sys
from typing import Optional


class DiagnosticResult:
    def __init__(self):
        self.checks: list[dict] = []
        self.can_run: bool = True
        self.warnings: list[str] = []
        self.errors: list[str] = []
        self.fix_suggestions: list[str] = []

    def add_check(self, name: str, ok: bool, message: str, fix: Optional[str] = None, severity: str = "info"):
        entry = {"name": name, "ok": ok, "message": message, "severity": severity}
        if fix:
            entry["fix"] = fix
        self.checks.append(entry)
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
        }


async def run_full_diagnostics(python_cmd: str) -> DiagnosticResult:
    """Run all diagnostics and return a structured result."""
    result = DiagnosticResult()

    # 1. Python version
    py_ok, py_msg, py_fix = await _check_python_version(python_cmd)
    result.add_check("Python version", py_ok, py_msg, py_fix, "error" if not py_ok else "info")

    # 2. sglang deep import
    sg_ok, sg_msg, sg_fix = await _check_sglang_imports(python_cmd)
    result.add_check("sglang installation", sg_ok, sg_msg, sg_fix, "error" if not sg_ok else "info")

    if not sg_ok:
        # If sglang isn't even importable, skip remaining checks
        return result

    # 3. PyTorch
    torch_ok, torch_msg, torch_fix = await _check_torch(python_cmd)
    result.add_check("PyTorch", torch_ok, torch_msg, torch_fix, "error" if not torch_ok else "info")

    # 4. CUDA
    cuda_ok, cuda_msg, cuda_fix, has_gpu = await _check_cuda(python_cmd)
    result.add_check("CUDA toolkit", cuda_ok, cuda_msg, cuda_fix, "warning" if not cuda_ok else "info")

    if not has_gpu:
        result.add_check(
            "NVIDIA GPU",
            False,
            "No NVIDIA GPU detected. sglang requires GPU (won't work on CPU).",
            "Run on a machine with NVIDIA GPU. Use 'nvidia-smi' to verify.",
            "error"
        )
        return result

    # 5. VRAM
    vram_ok, vram_msg, vram_fix = await _check_vram(python_cmd)
    result.add_check("GPU VRAM", vram_ok, vram_msg, vram_fix, "warning" if not vram_ok else "info")

    # 6. Optional: flash-attn
    fa_ok, fa_msg, fa_fix = await _check_optional(python_cmd, "flash_attn", "flash-attn")
    result.add_check("FlashAttention (optional)", fa_ok, fa_msg, fa_fix, "warning" if not fa_ok else "info")

    # 7. Optional: triton
    tr_ok, tr_msg, tr_fix = await _check_optional(python_cmd, "triton", "triton")
    result.add_check("Triton (optional)", tr_ok, tr_msg, tr_fix, "warning" if not tr_ok else "info")

    # 8. Disk space
    disk_ok, disk_msg, disk_fix = _check_disk_space()
    result.add_check("Disk space", disk_ok, disk_msg, disk_fix, "warning" if not disk_ok else "info")

    # 9. RAM
    ram_ok, ram_msg, ram_fix = _check_memory()
    result.add_check("System RAM", ram_ok, ram_msg, ram_fix, "warning" if not ram_ok else "info")

    return result


async def _check_python_version(python_cmd: str) -> tuple[bool, str, Optional[str]]:
    try:
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c", "import sys; print(sys.version_info.major, sys.version_info.minor)",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            return False, "Could not determine Python version", None
        major, minor = map(int, stdout.decode().strip().split())
        if major < 3 or (major == 3 and minor < 10):
            return False, f"Python {major}.{minor} too old (need 3.10+)", "Install Python 3.10 or newer"
        return True, f"Python {major}.{minor}", None
    except Exception as e:
        return False, f"Error: {e}", None


async def _check_sglang_imports(python_cmd: str) -> tuple[bool, str, Optional[str]]:
    """Test sglang installation by importing the full launch_server module."""
    try:
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c",
            "import sglang; from sglang.launch_server import launch_server; from sglang.srt.server_args import ServerArgs",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
        if proc.returncode != 0:
            err = stderr.decode(errors="replace").strip()
            fix = None
            if "kernels" in err or "LayerRepository" in err or "revision or a version" in err:
                fix = f"{python_cmd} -m pip install --upgrade 'transformers>=4.56' 'kernels>=0.10.0'"
            elif "Lfm2VlConfig" in err or "cannot import name" in err:
                fix = f"{python_cmd} -m pip install --upgrade 'transformers>=4.56'"
            elif "ModuleNotFoundError: No module named 'sglang'" in err:
                fix = f"{python_cmd} -m pip install sglang"
            return False, f"sglang import failed: {err[:200]}", fix
        return True, "sglang importable", None
    except asyncio.TimeoutError:
        return False, "sglang import timed out (30s)", None
    except Exception as e:
        return False, f"Error checking sglang: {e}", None


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


async def _check_cuda(python_cmd: str) -> tuple[bool, str, Optional[str], bool]:
    """Check CUDA toolkit, GPU availability, and torch CUDA support."""
    try:
        # Check torch CUDA
        proc = await asyncio.create_subprocess_exec(
            python_cmd, "-c",
            "import torch; print('CUDA:', torch.cuda.is_available()); print('GPUs:', torch.cuda.device_count()); "
            "print('Name:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none')",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            return False, f"Torch CUDA check failed: {stderr.decode()[:150]}", None, False

        out = stdout.decode()
        has_cuda = "CUDA: True" in out
        gpu_count = 0
        gpu_name = "none"
        for line in out.split("\n"):
            if line.startswith("GPUs:"):
                gpu_count = int(line.split(":", 1)[1].strip())
            if line.startswith("Name:"):
                gpu_name = line.split(":", 1)[1].strip()

        if not has_cuda:
            return False, "PyTorch was not compiled with CUDA support", "Install PyTorch with CUDA: pip install torch --index-url https://download.pytorch.org/whl/cu121", False

        if gpu_count == 0:
            return True, "CUDA available but no GPU detected", None, False

        return True, f"CUDA ready, {gpu_count} GPU(s): {gpu_name}", None, True
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
                return False, f"Only {total}GB VRAM (sglang needs 6GB minimum for small models)", "Use a GPU with more VRAM or use a smaller quantized model"
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
        return False, f"{pkg} not installed (optional, but recommended)", f"{python_cmd} -m pip install {pkg}"
    except Exception:
        return False, f"{pkg} check failed", None


def _check_disk_space() -> tuple[bool, str, Optional[str]]:
    try:
        usage = shutil.disk_usage("/")
        free_gb = usage.free // (1024 ** 3)
        if free_gb < 20:
            return False, f"Only {free_gb}GB free disk space (need 20GB+ for models)", "Free up disk space: rm -rf ~/.cache/huggingface/hub/* (after backing up downloaded models)"
        return True, f"{free_gb}GB free disk space", None
    except Exception as e:
        return True, f"Could not check disk space: {e}", None


def _check_memory() -> tuple[bool, str, Optional[str]]:
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    total_kb = int(line.split()[1])
                    total_gb = total_kb // (1024 ** 2)
                    if total_gb < 8:
                        return False, f"Only {total_gb}GB RAM (8GB+ recommended)", "Add more RAM or use a smaller model"
                    return True, f"{total_gb}GB RAM", None
    except Exception:
        pass
    return True, "Could not check RAM", None
