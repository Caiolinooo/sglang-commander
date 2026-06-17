from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.user import User
from app.services.diagnostics import run_full_diagnostics

router = APIRouter()


def _python_cmd() -> str:
    import sys
    import shutil
    import os
    if hasattr(sys, 'prefix') and sys.prefix != getattr(sys, 'base_prefix', sys.prefix):
        return os.path.join(sys.prefix, 'bin', 'python')
    return shutil.which("python3") or shutil.which("python") or sys.executable


@router.get("/")
async def run_diagnostics(
    current_user: User = Depends(get_current_user),
    full: bool = Query(False, description="Include full error tracebacks"),
):
    """Run full system diagnostics for sglang server requirements."""
    result = await run_full_diagnostics(_python_cmd())
    out = result.to_dict()
    out["python"] = _python_cmd()
    if not full:
        # Strip full_error from per-check payload
        for c in out["checks"]:
            c.pop("full_error", None)
    return out


@router.get("/versions")
async def get_versions(current_user: User = Depends(get_current_user)):
    """Return installed package versions (sglang, transformers, kernels, torch, flash-attn, triton)."""
    import asyncio
    python_cmd = _python_cmd()

    script = """
import importlib, sys
out = {}
for mod in ['sglang', 'transformers', 'kernels', 'torch', 'triton', 'flash_attn']:
    try:
        m = importlib.import_module(mod)
        out[mod] = getattr(m, '__version__', 'installed')
    except Exception as e:
        out[mod] = f'NOT_INSTALLED: {type(e).__name__}'
for k, v in out.items():
    print(f'{k}={v}')
"""
    proc = await asyncio.create_subprocess_exec(
        python_cmd, "-c", script,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    versions = {}
    for line in stdout.decode().strip().split("\n"):
        if "=" in line:
            k, v = line.split("=", 1)
            versions[k] = v
    return {"python": python_cmd, "versions": versions}


@router.post("/fix/{check_name}")
async def auto_fix(check_name: str, current_user: User = Depends(get_current_user)):
    """Try to auto-fix a specific check. Admin only."""
    import asyncio

    if not current_user.is_admin:
        return {"status": "error", "message": "Admin only"}

    python_cmd = _python_cmd()

    cmds = {
        "transformers": [python_cmd, "-m", "pip", "install", "transformers==5.6.0"],
        "kernels":      [python_cmd, "-m", "pip", "install", "kernels==0.10.0"],
        "flash-attn":   [python_cmd, "-m", "pip", "install", "flash-attn", "--no-build-isolation"],
        "triton":       [python_cmd, "-m", "pip", "install", "triton"],
        "sglang":       [python_cmd, "-m", "pip", "install", "--upgrade", "sglang"],
        "torch":        [python_cmd, "-m", "pip", "install", "torch", "--index-url", "https://download.pytorch.org/whl/cu121"],
        # Nuclear option: full reinstall
        "sglang-force":  [python_cmd, "-m", "pip", "install", "--force-reinstall", "--no-deps", "sglang"],
        # Known-good combo: sglang 0.5.12 + transformers 5.6.0 + kernels 0.10.0
        "all-compat":    [python_cmd, "-m", "pip", "install", "transformers==5.6.0", "kernels==0.10.0", "sglang"],
    }

    # Normalize check name
    normalized_name = check_name.lower().replace("_", " ").replace("-", " ")
    target_key = check_name
    if "sglang" in normalized_name:
        target_key = "sglang"
    elif "transformers" in normalized_name:
        target_key = "transformers"
    elif "kernels" in normalized_name:
        target_key = "kernels"
    elif "flash" in normalized_name:
        target_key = "flash-attn"
    elif "triton" in normalized_name:
        target_key = "triton"
    elif "torch" in normalized_name:
        target_key = "torch"

    if target_key not in cmds:
        return {"status": "error", "message": f"Unknown check: {check_name}. Available: {list(cmds.keys())}"}

    cmd_to_run = cmds[target_key]

    # If sglang import fails, extract the specific suggested fix (e.g. transformers==5.6.0) from diagnostics
    if target_key == "sglang":
        try:
            from app.services.diagnostics import run_full_diagnostics
            diag = await run_full_diagnostics(python_cmd)
            sglang_check = next((c for c in diag.checks if c["name"] == "sglang installation"), None)
            if sglang_check and not sglang_check["ok"] and sglang_check.get("fix"):
                fix_sug = sglang_check["fix"]
                prefix = f"{python_cmd} -m pip install "
                if fix_sug.startswith(prefix):
                    import shlex
                    cmd_to_run = [python_cmd, "-m", "pip", "install"] + shlex.split(fix_sug[len(prefix):].strip())
        except Exception:
            pass

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd_to_run,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180.0)
        except asyncio.TimeoutError:
            proc.kill()
            return {"status": "error", "message": f"Install timed out after 180s. Try manually:\n  {' '.join(cmd_to_run)}"}

        if proc.returncode == 0:
            return {
                "status": "ok",
                "message": f"{target_key} installed/upgraded successfully. Run diagnostics again to verify.",
                "stdout_tail": (stdout or b"").decode(errors="replace")[-400:],
            }
        else:
            err_tail = (stderr or stdout or b"").decode(errors="replace")[-600:]
            return {
                "status": "error",
                "message": f"{target_key} install failed. Manual fix:\n  {' '.join(cmd_to_run)}",
                "error_tail": err_tail,
            }
    except Exception as e:
        return {"status": "error", "message": str(e)}
