from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.services.updater import updater

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
