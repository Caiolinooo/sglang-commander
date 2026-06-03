from pydantic import BaseModel, Field
from typing import Optional, Any


class SettingUpdate(BaseModel):
    key: str
    value: Any


class SettingsResponse(BaseModel):
    app_name: str = "SGLang Commander"
    port: int = 8080
    sglang_default_host: str = "127.0.0.1"
    sglang_default_port: int = 30000
    update_check_url_selfhosted: Optional[str] = None
    debug: bool = False
