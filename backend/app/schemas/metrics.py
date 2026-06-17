from pydantic import BaseModel


class CPUCoreMetrics(BaseModel):
    index: int
    percent: float
    frequency_mhz: float = 0.0


class DiskIOMetrics(BaseModel):
    read_bytes_s: float = 0.0
    write_bytes_s: float = 0.0
    read_count_s: float = 0.0
    write_count_s: float = 0.0
    percent: float = 0.0


class NetworkIOMetrics(BaseModel):
    bytes_sent_s: float = 0.0
    bytes_recv_s: float = 0.0
    packets_sent_s: float = 0.0
    packets_recv_s: float = 0.0


class SwapMetrics(BaseModel):
    percent: float = 0.0
    used_gb: float = 0.0
    total_gb: float = 0.0


class ProcessMetrics(BaseModel):
    pid: int
    name: str
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    gpu_memory_mb: float = 0.0


class GPUMetrics(BaseModel):
    index: int = 0
    name: str = "Unknown"
    vendor: str = "unknown"
    util_pct: float = 0.0
    mem_used_mb: float = 0.0
    mem_total_mb: float = 0.0
    mem_free_mb: float = 0.0
    temp_c: float = 0.0
    power_w: float = 0.0
    mem_util_pct: float = 0.0
    processes: list[ProcessMetrics] = []


class MetricsSnapshot(BaseModel):
    timestamp: float
    prompt_tokens_total: float = 0.0
    generation_tokens_total: float = 0.0
    gen_throughput: float = 0.0
    num_running_reqs: int = 0
    num_queue_reqs: int = 0
    token_usage: float = 0.0
    cache_hit_rate: float = 0.0
    ttft_avg_ms: float = 0.0
    tpot_avg_ms: float = 0.0
    e2e_latency_avg_ms: float = 0.0
    context_len: int = 0
    kv_available_tokens: int = 0
    utilization: float = 0.0
    queue_time_avg_ms: float = 0.0
    new_token_ratio: float = 0.0

    gpu: list[GPUMetrics] = []
    gpu_vendor: str = "unknown"
    gpu_count: int = 0

    cpu_percent: float = 0.0
    cpu_cores: list[CPUCoreMetrics] = []
    cpu_freq_mhz: float = 0.0
    cpu_count_logical: int = 0
    cpu_count_physical: int = 0
    cpu_load_1m: float = 0.0
    cpu_load_5m: float = 0.0
    cpu_load_15m: float = 0.0

    ram_percent: float = 0.0
    ram_used_gb: float = 0.0
    ram_total_gb: float = 0.0
    ram_available_gb: float = 0.0

    swap: SwapMetrics = SwapMetrics()
    disk: DiskIOMetrics = DiskIOMetrics()
    network: NetworkIOMetrics = NetworkIOMetrics()

    processes_top: list[ProcessMetrics] = []


class MetricsHistoryResponse(BaseModel):
    metrics: list[MetricsSnapshot]
