from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class ServerStartRequest(BaseModel):
    model_path: str = Field(..., description="HF repo ID or local path")
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=30000, ge=1024, le=65535)
    tensor_parallel_size: int = Field(default=1, ge=1)
    quantization: Optional[str] = Field(default=None, description="awq, fp8, gptq, marlin, etc.")
    dtype: Optional[str] = Field(default=None, description="auto, half, bfloat16, float32")
    enable_multimodal: bool = Field(default=False)
    trust_remote_code: bool = Field(default=False)
    context_length: Optional[int] = Field(default=None)
    extra_args: dict[str, Any] = Field(default_factory=dict)


class ServerStatusResponse(BaseModel):
    running: bool
    model_path: Optional[str] = None
    host: str = ""
    port: int = 0
    pid: Optional[int] = None
    uptime_seconds: Optional[float] = None
    health: str = "unknown"
    model_info: Optional[dict[str, Any]] = None


class ServerLogResponse(BaseModel):
    lines: list[str]
    cursor: int = 0


class ServerConfigResponse(BaseModel):
    id: int
    name: str
    model_path: str
    host: str
    port: int
    args_json: str
    is_active: bool
    is_remote: bool
    remote_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ServerProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    model_path: str = Field(..., max_length=512)
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=30000, ge=1024, le=65535)
    args_json: str = Field(default="{}")
    is_remote: bool = Field(default=False)
    remote_url: Optional[str] = Field(default=None)


class ServerProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    model_path: Optional[str] = Field(default=None, max_length=512)
    host: Optional[str] = Field(default=None)
    port: Optional[int] = Field(default=None, ge=1024, le=65535)
    args_json: Optional[str] = Field(default=None)
    is_remote: Optional[bool] = Field(default=None)
    remote_url: Optional[str] = Field(default=None)
