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

    # Tool calling & reasoning
    tool_call_parser: Optional[str] = Field(default=None, description="llama3, qwen, mistral, deepseekv3, etc.")
    reasoning_parser: Optional[str] = Field(default=None, description="deepseek-r1, qwen3, etc.")
    chat_template: Optional[str] = Field(default=None)
    grammar_backend: Optional[str] = Field(default=None, description="auto, xgrammar, outlines, llguidance")

    # Load format
    load_format: Optional[str] = Field(default=None, description="auto, safetensors, gguf")
    is_embedding: bool = Field(default=False)
    log_level: Optional[str] = Field(default=None, description="debug, info, warning, error")

    # Memory optimization
    kv_cache_dtype: Optional[str] = Field(default=None, description="auto, fp8_e4m3, fp8_e5m2, fp4_e2m1, bf16")
    mem_fraction_static: Optional[float] = Field(default=None, ge=0.3, le=0.99, description="GPU memory fraction for model+KV. Lower if OOM")
    cpu_offload_gb: Optional[float] = Field(default=None, ge=0, description="GB of model weights to offload to CPU RAM")
    disable_cuda_graph: bool = Field(default=False)
    max_running_requests: Optional[int] = Field(default=None, ge=1, le=1024)

    # MoE
    ep_size: Optional[int] = Field(default=None, ge=1, description="Expert parallelism size")
    moe_runner_backend: Optional[str] = Field(default=None, description="auto, deep_gemm, triton, cutlass")
    enable_dp_attention: bool = Field(default=False)
    enable_ep_moe: bool = Field(default=False)

    # Speculative decoding / MTP
    speculative_algorithm: Optional[str] = Field(default=None, description="EAGLE, NGRAM, NEXTN, STANDALONE")
    speculative_num_steps: Optional[int] = Field(default=None, ge=1, le=10)
    speculative_draft_model_path: Optional[str] = Field(default=None)

    # Pipeline parallelism
    pp_size: Optional[int] = Field(default=None, ge=1, description="Pipeline parallelism size")

    backend_type: Optional[str] = Field(default="sglang", description="Backend type: sglang, llamacpp, or ollama")
    custom_args: Optional[str] = Field(default=None, description="Raw CLI flags (like -t 8 --threads-batch 16) to append to the start command")
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
