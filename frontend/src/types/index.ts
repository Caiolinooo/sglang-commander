export interface User {
  id: number
  username: string
  email: string
  is_admin: boolean
  created_at: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface ServerStatus {
  running: boolean
  model_path?: string
  host?: string
  port?: number
  pid?: number
  uptime_seconds?: number
  health?: string
  model_info?: Record<string, unknown>
}

export interface TokenEstimate {
  max_context: number
  practical_context: number
  recommended_max_input: number
  recommended_max_output: number
}

export interface GPUInfo {
  name: string
  total_gb: number
  free_gb: number
  used_gb: number
}

export interface HFModel {
  repo_id: string
  model_name: string
  author: string
  downloads: number
  likes: number
  pipeline_tag?: string
  library_name?: string
  tags: string[]
  description?: string
  format?: string
  quantization?: string
  params_billions?: number
  vram_estimate_gb?: number
  fits_in_gpu?: boolean
  context_length?: number
  tokens?: TokenEstimate
  is_multimodal?: boolean
  is_moe?: boolean
}

export interface ModelConfig {
  repo_id: string
  model_name: string
  pipeline_tag?: string
  library_name?: string
  tags: string[]
  architectures: string[]
  context_length: number
  quantization_config: Record<string, unknown>
  num_parameters: Record<string, unknown>
  format: string
  quantization: string
  params_billions?: number
  vram_estimate_gb: number
  fits_in_gpu: boolean
  tokens: TokenEstimate
  is_multimodal: boolean
  is_moe: boolean
  has_mtp_head: boolean
  mtp_layer_count: number
  supports_tool_calling: boolean
  supports_reasoning: boolean
  gpu: GPUInfo
  recommended: {
    tool_call_parser: string
    reasoning_parser: string
    enable_multimodal: boolean
    context_length: number
    speculative_algorithm: string
    speculative_num_steps: number | null
    load_format: string
    dtype: string
    kv_cache_dtype: string
    cpu_offload_gb: number
  }
  config: Record<string, unknown>
}

export interface ZeroTierStatus {
  installed: boolean
  running: boolean
  node_id?: string
  online: boolean
  networks: ZeroTierNetwork[]
}

export interface ZeroTierNetwork {
  network_id: string
  name: string
  status: string
  assigned_ips: string[]
}

export interface ServerProfile {
  id: number
  name: string
  model_path: string
  host: string
  port: number
  args_json: string
  is_active: boolean
  is_remote: boolean
  remote_url?: string
  created_at: string
  updated_at?: string
}

export interface BenchmarkResult {
  status: string
  summary?: {
    num_runs: number
    concurrency: number
    total_time_seconds: number
    avg_latency_ms: number
    min_latency_ms: number
    max_latency_ms: number
    p50_latency_ms: number
    p95_latency_ms: number
    p99_latency_ms: number
    total_tokens: number
    tokens_per_second: number
    errors: number
  }
  runs?: Array<{
    run: number
    latency_ms: number
    tokens_generated: number
    error?: string
  }>
}

export interface BenchmarkStatus {
  running: boolean
  progress: number
  results: Array<{
    run: number
    latency_ms: number
    tokens_generated: number
  }>
}

export interface UpdateStatus {
  status: string
  progress: number
  downloaded_bytes: number
  total_bytes: number
  error?: string
  path?: string
}

export interface UpdateCheckResponse {
  update_available: boolean
  current_version: string
  latest_version?: string
  download_url?: string
  changelog?: string
  release_date?: string
  source?: string
}

export type Theme = 'dark' | 'light'

export interface LocalModel {
  repo_id: string
  model_name: string
  local_path: string
  size_gb: number
  format: string
  quantization: string
  quantization_method?: string
  params_billions: number | null
  vram_estimate_gb: number
  fits_in_gpu: boolean
  context_length: number
  architectures: string[]
  is_moe?: boolean
  compatible?: boolean
  warnings?: string[]
  recommended_quant?: string
  tokens?: TokenEstimate
}

export interface LocateModelResponse {
  repo_id: string
  local_path: string
  size_gb: number
  format: string
  files: string[]
}

export interface DeleteModelResponse {
  repo_id: string
  deleted_path: string
  freed_bytes: number
  freed_gb: number
}

export interface ModelValidation {
  valid: boolean
  warnings: string[]
  errors: string[]
  suggestions: string[]
  model_info?: {
    architectures: string[]
    params_billions: number | null
    is_moe: boolean
    quantization_method: string
    vram_estimate_gb: number
  }
}

export interface GPUProcess {
  pid: number
  name: string
  used_mb: number
}

export interface GPULiveInfo {
  index: number
  name: string
  total_mb: number
  used_mb: number
  free_mb: number
  utilization_pct: number
  gpu_util_pct: number
  memory_util_pct: number
  temperature_c: number
  power_w: number
  power_limit_w: number
  processes: GPUProcess[]
}

export interface GPULiveStatus {
  gpus: GPULiveInfo[]
  count: number
  error?: string
}

export interface MetricsSnapshot {
  timestamp: number
  prompt_tokens_total: number
  generation_tokens_total: number
  gen_throughput: number
  num_running_reqs: number
  num_queue_reqs: number
  token_usage: number
  cache_hit_rate: number
  ttft_avg_ms: number
  tpot_avg_ms: number
  e2e_latency_avg_ms: number
  gpu_util: number
  gpu_mem_used_mb: number
  gpu_mem_total_mb: number
  gpu_temp_c: number
  gpu_power_w: number
  cpu_percent: number
  ram_percent: number
  gpu_live?: GPULiveStatus
}

export interface ModelSearchFilters {
  task?: string
  library?: string
  license?: string
  framework?: string
  language?: string
  author?: string
  sort_by?: string
  sort_dir?: number
  min_params?: number
  max_params?: number
  quantization?: string
  format?: string
  fits_gpu?: boolean
  multimodal?: boolean
}
