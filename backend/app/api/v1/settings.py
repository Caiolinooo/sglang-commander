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
