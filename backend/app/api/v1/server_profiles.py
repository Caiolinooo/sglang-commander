from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.server import ServerProfileCreate, ServerProfileUpdate
from app.services.server_profile_service import server_profile_service

router = APIRouter()


@router.get("/")
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await server_profile_service.list_profiles(db)


@router.get("/active")
async def get_active_profile(
    db: AsyncSession = Depends(get_db),
):
    profile = await server_profile_service.get_active(db)
    if not profile:
        return None
    return profile


@router.get("/{profile_id}")
async def get_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = await server_profile_service.get_profile(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.post("/")
async def create_profile(
    req: ServerProfileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await server_profile_service.create_profile(db, req)


@router.put("/{profile_id}")
async def update_profile(
    profile_id: int,
    req: ServerProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = await server_profile_service.update_profile(db, profile_id, req)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.delete("/{profile_id}")
async def delete_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    success = await server_profile_service.delete_profile(db, profile_id)
    if not success:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"status": "deleted"}


@router.post("/{profile_id}/activate")
async def activate_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = await server_profile_service.set_active(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile
