from fastapi import APIRouter, Depends
from typing import List
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models.user import User
from app.services.dependency_updater import dependency_updater

router = APIRouter()

class UpgradeRequest(BaseModel):
    packages: List[str]

@router.get("/check")
async def check_dependencies():
    outdated = await dependency_updater.check_updates()
    return {"outdated": outdated}

@router.post("/upgrade")
async def upgrade_dependencies(
    req: UpgradeRequest,
    current_user: User = Depends(get_current_user),
):
    return await dependency_updater.upgrade_packages(req.packages)

@router.get("/status")
async def upgrade_status():
    return dependency_updater.get_status()
