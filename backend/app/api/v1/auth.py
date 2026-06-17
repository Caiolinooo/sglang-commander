from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    SetupRequest, LoginRequest, RefreshRequest,
    ChangePasswordRequest, SetupStatusResponse, UserResponse,
    ApiKeyCreate, ApiKeyResponse,
)
from app.services.auth_service import auth_service

router = APIRouter()


@router.get("/setup-status", response_model=SetupStatusResponse)
async def get_setup_status():
    complete = await auth_service.is_setup_complete()
    return SetupStatusResponse(setup_complete=complete)


@router.post("/setup")
async def setup_admin(req: SetupRequest):
    if await auth_service.is_setup_complete():
        raise HTTPException(status_code=400, detail="Setup already completed")
    result = await auth_service.complete_setup(req.username, req.email, req.password, req.huggingface_token)
    return result


@router.post("/login")
async def login(req: LoginRequest):
    result = await auth_service.login(req.username, req.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return result


@router.post("/refresh")
async def refresh(req: RefreshRequest):
    result = await auth_service.refresh_token(req.refresh_token)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    return result


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
):
    success = await auth_service.change_password(current_user.id, req.current_password, req.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    return {"status": "ok"}


@router.post("/api-keys", response_model=ApiKeyResponse)
async def create_api_key(
    req: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
):
    result = await auth_service.create_api_key(current_user.id, req.name, req.scopes)
    return result


@router.get("/api-keys")
async def list_api_keys(current_user: User = Depends(get_current_user)):
    return await auth_service.list_api_keys(current_user.id)


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
):
    success = await auth_service.revoke_api_key(current_user.id, key_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "revoked"}


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    await auth_service.logout(current_user.id)
    return {"status": "logged_out"}


@router.post("/reset")
async def reset_database():
    return await auth_service.reset_database()
