from fastapi import APIRouter, Depends, Request, HTTPException, BackgroundTasks
import hmac
import hashlib
import os
import sys
import subprocess
import asyncio

from app.core.deps import get_current_user
from app.models.user import User
from app.services.updater import updater
from app.config import settings

router = APIRouter()


@router.get("/check")
async def check_for_updates():
    return await updater.check_all()


@router.post("/download")
async def download_update(
    url: str,
    current_user: User = Depends(get_current_user),
):
    return await updater.download_update(url)


@router.get("/status")
async def update_status():
    return await updater.get_status()


@router.post("/apply")
async def apply_update(current_user: User = Depends(get_current_user)):
    return await updater.apply_update()


@router.post("/cancel")
async def cancel_update(current_user: User = Depends(get_current_user)):
    return await updater.cancel_download()


async def run_rebuild_and_restart():
    # Base directory is 3 levels up from this file
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    frontend_dir = os.path.join(base_dir, "frontend")

    # Wait a bit to let the response finish
    await asyncio.sleep(1.0)

    # 1. Git pull
    try:
        subprocess.run(["git", "pull"], cwd=base_dir, check=True, timeout=60)
    except Exception as e:
        print(f"[Webhook Error] git pull failed: {e}")
        return

    # 2. Build frontend
    try:
        # Try npm install + build
        subprocess.run(["npm", "install"], cwd=frontend_dir, check=True, timeout=120)
        subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True, timeout=120)
    except Exception:
        # Fallback to npx vite build without npm install
        try:
            subprocess.run(["npx", "vite", "build"], cwd=frontend_dir, check=True, timeout=120)
        except Exception as ex:
            print(f"[Webhook Error] Frontend build failed: {ex}")

    # 3. Restart backend
    await asyncio.sleep(1.0)
    os.execv(sys.executable, [sys.executable] + sys.argv)


@router.post("/webhook")
async def github_webhook(request: Request, background_tasks: BackgroundTasks):
    """GitHub webhook to automatically pull changes, rebuild frontend, and restart backend."""
    if settings.webhook_secret:
        signature = request.headers.get("X-Hub-Signature-256")
        if not signature:
            raise HTTPException(status_code=400, detail="Missing X-Hub-Signature-256 header")

        body = await request.body()
        expected = "sha256=" + hmac.new(
            settings.webhook_secret.encode("utf-8"),
            body,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid signature")

    background_tasks.add_task(run_rebuild_and_restart)
    return {"status": "ok", "message": "Rebuild and restart triggered"}


@router.get("/webhook")
async def webhook_info():
    """Friendly message for browser testing."""
    return {
        "status": "active",
        "message": "Webhook endpoint is working. Please send a POST request (GitHub webhook) to trigger the rebuild."
    }


