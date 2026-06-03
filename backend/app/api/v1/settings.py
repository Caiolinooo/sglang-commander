from fastapi import APIRouter, Depends

from app.config import settings as app_settings
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.settings import SettingUpdate, SettingsResponse

router = APIRouter()


@router.get("/", response_model=SettingsResponse)
async def get_settings():
    return SettingsResponse(
        app_name=app_settings.app_name,
        port=app_settings.port,
        sglang_default_host=app_settings.sglang_default_host,
        sglang_default_port=app_settings.sglang_default_port,
        update_check_url_selfhosted=app_settings.update_check_url_selfhosted,
        debug=app_settings.debug,
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
