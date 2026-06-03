from pydantic import BaseModel, Field
from typing import Optional, Any


class HFSearchRequest(BaseModel):
    query: str
    limit: int = Field(default=20, ge=1, le=100)
    task: Optional[str] = None
    sort: str = "downloads"


class HFModelItem(BaseModel):
    repo_id: str
    model_name: str
    author: str
    downloads: int
    likes: int
    pipeline_tag: Optional[str] = None
    library_name: Optional[str] = None
    tags: list[str] = []
    description: str = ""


class HFSearchResponse(BaseModel):
    models: list[HFModelItem]
    total: int


class DownloadRequest(BaseModel):
    repo_id: str
    revision: str = "main"
    filename: Optional[str] = None


class DownloadStatus(BaseModel):
    repo_id: str
    status: str  # downloading, completed, error
    progress: float = 0.0
    speed: str = ""
    error: Optional[str] = None


class LocalModelInfo(BaseModel):
    repo_id: str
    path: str
    size_bytes: int
    quant: Optional[str] = None
    architecture: Optional[str] = None
    context_length: Optional[int] = None
    modalities: list[str] = []
