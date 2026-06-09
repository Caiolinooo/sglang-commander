from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings as app_settings
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.settings import SettingUpdate, SettingsResponse
from app.services.auth_service import auth_service

router = APIRouter()


class HuggingFaceTokenRequest(BaseModel):
    token: str


@router.get("/", response_model=SettingsResponse)
async def get_settings():
    return SettingsResponse(
        app_name=app_settings.app_name,
        port=app_settings.port,
        sglang_default_host=app_settings.sglang_default_host,
        sglang_default_port=app_settings.sglang_default_port,
        update_check_url_selfhosted=app_settings.update_check_url_selfhosted,
        debug=app_settings.debug,
        huggingface_token="configured" if app_settings.huggingface_token else None,
    )


@router.put("/")
async def update_settings(
    req: SettingUpdate,
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        return {"status": "error", "message": "Only admins can change settings"}
    setattr(app_settings, req.key, req.value)
    return {"status": "ok", "key": req.key, "value": req.value}


@router.post("/huggingface-token")
async def save_huggingface_token(
    req: HuggingFaceTokenRequest,
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        return {"status": "error", "message": "Only admins can change settings"}
    app_settings.huggingface_token = req.token
    auth_service._save_env_var("HUGGINGFACE_TOKEN", req.token)
    return {"status": "ok", "message": "HuggingFace token saved"}


@router.post("/restart")
async def restart_project(current_user: User = Depends(get_current_user)):
    """Restart the entire backend server process."""
    if not current_user.is_admin:
        return {"status": "error", "message": "Only admins can restart the server"}

    import os
    import sys

    # Schedule the restart after sending the response
    import asyncio
    async def _do_restart():
        await asyncio.sleep(0.5)
        os.execv(sys.executable, [sys.executable] + sys.argv)

    asyncio.create_task(_do_restart())
    return {"status": "restarting", "message": "Server is restarting. Page will reload in a few seconds."}


@router.post("/restart-and-rebuild")
async def restart_and_rebuild(current_user: User = Depends(get_current_user)):
    """Rebuild frontend and restart the backend server."""
    if not current_user.is_admin:
        return {"status": "error", "message": "Only admins can restart the server"}

    import os
    import sys
    import asyncio

    frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend")
    frontend_dir = os.path.abspath(frontend_dir)

    async def _do_rebuild_and_restart():
        await asyncio.sleep(0.3)

        # Step 1: Rebuild frontend
        import subprocess
        try:
            # Try npm run build first
            result = subprocess.run(
                ["npm", "run", "build"],
                cwd=frontend_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                # Fallback to npx vite build
                result = subprocess.run(
                    ["npx", "vite", "build"],
                    cwd=frontend_dir,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
        except FileNotFoundError:
            # npm not found, try npx directly
            try:
                result = subprocess.run(
                    ["npx", "vite", "build"],
                    cwd=frontend_dir,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
            except Exception:
                pass
        except Exception:
            pass

        # Step 2: Restart backend
        await asyncio.sleep(0.5)
        os.execv(sys.executable, [sys.executable] + sys.argv)

    asyncio.create_task(_do_rebuild_and_restart())
    return {
        "status": "rebuilding",
        "message": "Rebuilding frontend and restarting backend. Page will reload in a few seconds.",
    }
