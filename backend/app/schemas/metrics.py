from pydantic import BaseModel
from typing import Optional, Any


class MetricsSnapshot(BaseModel):
    timestamp: float
    prompt_tokens_total: int = 0
    generation_tokens_total: int = 0
    gen_throughput: float = 0.0
    num_running_reqs: int = 0
    num_queue_reqs: int = 0
    token_usage: float = 0.0
    cache_hit_rate: float = 0.0
    ttft_avg_ms: float = 0.0
    tpot_avg_ms: float = 0.0
    e2e_latency_avg_ms: float = 0.0
    gpu_util: float = 0.0
    gpu_mem_used_mb: float = 0.0
    gpu_mem_total_mb: float = 0.0
    gpu_temp_c: float = 0.0
    cpu_percent: float = 0.0
    ram_percent: float = 0.0


class MetricsHistoryResponse(BaseModel):
    metrics: list[MetricsSnapshot]
