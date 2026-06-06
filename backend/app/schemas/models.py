from pydantic import BaseModel, Field
from typing import Optional, Any


class HFSearchRequest(BaseModel):
    query: str
    limit: int = Field(default=20, ge=1, le=100)
    task: Optional[str] = None
    sort: str = "downloads"


class TokenEstimate(BaseModel):
    max_context: int = 4096
    practical_context: int = 3481
    recommended_max_input: int = 2610
    recommended_max_output: int = 870


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
    format: str = "unknown"
    quantization: str = "fp16"
    params_billions: Optional[float] = None
    vram_estimate_gb: float = 0
    fits_in_gpu: bool = False
    context_length: int = 4096
    tokens: Optional[TokenEstimate] = None


class GPUInfo(BaseModel):
    name: str = "Unknown"
    total_gb: float = 0
    free_gb: float = 0
    used_gb: float = 0


class HFSearchResponse(BaseModel):
    models: list[HFModelItem]
    total: int
    gpu: Optional[GPUInfo] = None


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
    size_gb: float = 0
    quant: Optional[str] = None
    architecture: Optional[str] = None
    context_length: Optional[int] = None
    modalities: list[str] = []


class LocateModelResponse(BaseModel):
    repo_id: str
    local_path: str
    size_gb: float
    format: str
    files: list[str]


class DeleteModelResponse(BaseModel):
    repo_id: str
    deleted_path: str
    freed_bytes: int
    freed_gb: float


class DeployModelRequest(BaseModel):
    repo_id: str
    quantization: Optional[str] = None
    dtype: str = "auto"
    context_length: Optional[int] = None
    tensor_parallel_size: int = 1
    host: str = "127.0.0.1"
    port: int = 30000
    trust_remote_code: bool = True
    tool_call_parser: Optional[str] = None
    reasoning_parser: Optional[str] = None
    enable_multimodal: Optional[bool] = None
    load_format: Optional[str] = None


class HFSearchRequest(BaseModel):
    query: str = ""
    limit: int = Field(default=20, ge=1, le=100)
    task: Optional[str] = None
    library: Optional[str] = None
    license: Optional[str] = None
    framework: Optional[str] = None
    language: Optional[str] = None
    author: Optional[str] = None
    sort_by: str = "downloads"
    sort_dir: int = -1
    min_params: Optional[float] = None
    max_params: Optional[float] = None
    quantization: Optional[str] = None
    format: Optional[str] = None
    fits_gpu: bool = False
    multimodal: bool = False
