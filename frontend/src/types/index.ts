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
  cpu_percent: number
  ram_percent: number
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
  }
  runs?: Array<{
    run: number
    latency_ms: number
    tokens_generated: number
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
