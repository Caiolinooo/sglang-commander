from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.connection import ConnectionProfile
from app.schemas.connection import (
    ConnectionProfileCreate,
    ConnectionProfileUpdate,
    ConnectionProfileResponse,
    ConnectionTestRequest,
)
from app.services.connection_manager import connection_manager

router = APIRouter()


@router.get("", response_model=List[ConnectionProfileResponse])
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ConnectionProfile).order_by(ConnectionProfile.created_at))
    profiles = result.scalars().all()
    # Ensure in-memory status matches db status
    for p in profiles:
        p.is_active = connection_manager.is_tunnel_active(p.id)
    return profiles


@router.get("/{profile_id}", response_model=ConnectionProfileResponse)
async def get_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ConnectionProfile).where(ConnectionProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection profile not found."
        )
    profile.is_active = connection_manager.is_tunnel_active(profile.id)
    return profile


@router.post("", response_model=ConnectionProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    data: ConnectionProfileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check duplicate name
    existing_result = await db.execute(select(ConnectionProfile).where(ConnectionProfile.name == data.name))
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Profile name '{data.name}' already exists."
        )

    profile = ConnectionProfile(
        name=data.name,
        host=data.host,
        port=data.port,
        username=data.username,
        auth_method=data.auth_method,
        password=data.password,
        key_path=data.key_path,
        remote_forward_port=data.remote_forward_port,
        local_bind_port=data.local_bind_port,
        is_active=False
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/{profile_id}", response_model=ConnectionProfileResponse)
async def update_profile(
    profile_id: int,
    data: ConnectionProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ConnectionProfile).where(ConnectionProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection profile not found."
        )

    if connection_manager.is_tunnel_active(profile_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update connection profile while the tunnel is active. Disconnect it first."
        )

    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != profile.name:
        existing_result = await db.execute(select(ConnectionProfile).where(ConnectionProfile.name == update_data["name"]))
        if existing_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Profile name '{update_data['name']}' already exists."
            )

    for key, val in update_data.items():
        setattr(profile, key, val)

    await db.commit()
    await db.refresh(profile)
    profile.is_active = connection_manager.is_tunnel_active(profile.id)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ConnectionProfile).where(ConnectionProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection profile not found."
        )

    if connection_manager.is_tunnel_active(profile_id):
        await connection_manager.disconnect_tunnel(profile_id)

    await db.delete(profile)
    await db.commit()
    return None


@router.post("/test")
async def test_connection(
    data: ConnectionTestRequest,
    current_user: User = Depends(get_current_user),
):
    success, msg = await connection_manager.test_connection(
        host=data.host,
        port=data.port,
        username=data.username,
        auth_method=data.auth_method,
        password=data.password,
        key_path=data.key_path
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg
        )
    return {"status": "success", "message": msg}


@router.post("/{profile_id}/connect")
async def connect_tunnel(
    profile_id: int,
    current_user: User = Depends(get_current_user),
):
    res = await connection_manager.connect_tunnel(profile_id)
    if res.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.get("message")
        )
    return res


@router.post("/{profile_id}/disconnect")
async def disconnect_tunnel(
    profile_id: int,
    current_user: User = Depends(get_current_user),
):
    success = await connection_manager.disconnect_tunnel(profile_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tunnel is not active or could not be disconnected."
        )
    return {"status": "disconnected"}
