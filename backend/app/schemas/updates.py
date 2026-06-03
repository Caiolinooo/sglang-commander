from pydantic import BaseModel
from typing import Optional


class UpdateCheckResponse(BaseModel):
    update_available: bool
    current_version: str
    latest_version: Optional[str] = None
    download_url: Optional[str] = None
    changelog: Optional[str] = None
    release_date: Optional[str] = None


class UpdateStatusResponse(BaseModel):
    status: str  # idle, downloading, applying, done, error
    progress: float = 0.0
    downloaded_bytes: int = 0
    total_bytes: int = 0
    error: Optional[str] = None
