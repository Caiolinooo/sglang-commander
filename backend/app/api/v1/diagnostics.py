from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.services.diagnostics import run_full_diagnostics
from app.services.server_manager import server_manager
from app.config import settings

router = APIRouter()


@router.get("/")
async def run_diagnostics(current_user: User = Depends(get_current_user)):
    """Run full system diagnostics for sglang server requirements.

    Returns detailed info about Python, sglang, PyTorch, CUDA, GPU, VRAM,
    disk space, RAM, and optional deps. Each check has a fix suggestion.
    """
    import sys
    import shutil
    import os

    if hasattr(sys, 'prefix') and sys.prefix != getattr(sys, 'base_prefix', sys.prefix):
        python_cmd = os.path.join(sys.prefix, 'bin', 'python')
    else:
        python_cmd = shutil.which("python3") or shutil.which("python") or sys.executable

    result = await run_full_diagnostics(python_cmd)
    result_dict = result.to_dict()
    result_dict["python"] = python_cmd
    return result_dict


@router.post("/fix/{check_name}")
async def auto_fix(check_name: str, current_user: User = Depends(get_current_user)):
    """Try to auto-fix a specific check.

    Available: 'transformers', 'kernels', 'flash-attn', 'triton'
    """
    import sys
    import shutil
    import os
    import asyncio

    if not current_user.is_admin:
        return {"status": "error", "message": "Admin only"}

    if hasattr(sys, 'prefix') and sys.prefix != getattr(sys, 'base_prefix', sys.prefix):
        python_cmd = os.path.join(sys.prefix, 'bin', 'python')
    else:
        python_cmd = shutil.which("python3") or shutil.which("python") or sys.executable

    cmds = {
        "transformers": [python_cmd, "-m", "pip", "install", "--upgrade", "transformers>=4.56"],
        "kernels": [python_cmd, "-m", "pip", "install", "--upgrade", "kernels>=0.10.0"],
        "flash-attn": [python_cmd, "-m", "pip", "install", "flash-attn", "--no-build-isolation"],
        "triton": [python_cmd, "-m", "pip", "install", "triton"],
        "sglang": [python_cmd, "-m", "pip", "install", "sglang"],
        "torch": [python_cmd, "-m", "pip", "install", "torch", "--index-url", "https://download.pytorch.org/whl/cu121"],
    }

    if check_name not in cmds:
        return {"status": "error", "message": f"Unknown check: {check_name}. Available: {list(cmds.keys())}"}

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmds[check_name],
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)
        except asyncio.TimeoutError:
            proc.kill()
            return {"status": "error", "message": f"Install timed out after 120s"}

        if proc.returncode == 0:
            return {"status": "ok", "message": f"{check_name} installed/upgraded successfully"}
        else:
            return {"status": "error", "message": stderr.decode(errors='replace')[-500:]}
    except Exception as e:
        return {"status": "error", "message": str(e)}
