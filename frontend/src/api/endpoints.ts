import apiClient from './client'
import type { ServerStatus, MetricsSnapshot, HFModel, GPUInfo, ZeroTierStatus, ServerProfile, BenchmarkResult, BenchmarkStatus, UpdateStatus, UpdateCheckResponse, LocalModel, GPULiveStatus, LocateModelResponse, DeleteModelResponse, ModelSearchFilters } from '../types'

// Auth
export const checkSetupStatus = () => apiClient.get('/auth/setup-status')
export const setupAdmin = (data: { username: string; email: string; password: string; server_port?: number; huggingface_token?: string }) =>
  apiClient.post('/auth/setup', data)
export const login = (username: string, password: string) =>
  apiClient.post('/auth/login', { username, password })
export const refreshToken = (refresh_token: string) =>
  apiClient.post('/auth/refresh', { refresh_token })
export const getMe = () => apiClient.get('/auth/me')
export const changePassword = (current_password: string, new_password: string) =>
  apiClient.post('/auth/change-password', { current_password, new_password })
export const createApiKey = (name: string, scopes: string = 'read') =>
  apiClient.post('/auth/api-keys', { name, scopes })
export const listApiKeys = () => apiClient.get('/auth/api-keys')
export const revokeApiKey = (keyId: number) => apiClient.delete(`/auth/api-keys/${keyId}`)

// Server
export const startServer = (config: Record<string, unknown>) =>
  apiClient.post('/server/start', config)
export const stopServer = () => apiClient.post('/server/stop')
export const restartServer = () => apiClient.post('/server/restart')
export const getServerStatus = () => apiClient.get<ServerStatus>('/server/status')
export const getServerLogs = (cursor: number = 0) =>
  apiClient.get(`/server/logs?cursor=${cursor}`)
export const healthCheck = () => apiClient.get('/server/health')
export const getModelInfo = () => apiClient.get('/server/model-info')
export const validateModel = (config: Record<string, unknown>) =>
  apiClient.post<{ valid: boolean; warnings: string[]; errors: string[]; suggestions: string[]; model_info: any }>('/server/validate', config)

// Server Profiles
export const listServerProfiles = () => apiClient.get<ServerProfile[]>('/server-profiles/')
export const getActiveProfile = () => apiClient.get<ServerProfile | null>('/server-profiles/active')
export const getServerProfile = (id: number) => apiClient.get<ServerProfile>(`/server-profiles/${id}`)
export const createServerProfile = (data: Partial<ServerProfile>) =>
  apiClient.post<ServerProfile>('/server-profiles/', data)
export const updateServerProfile = (id: number, data: Partial<ServerProfile>) =>
  apiClient.put<ServerProfile>(`/server-profiles/${id}`, data)
export const deleteServerProfile = (id: number) =>
  apiClient.delete(`/server-profiles/${id}`)
export const activateServerProfile = (id: number) =>
  apiClient.post<ServerProfile>(`/server-profiles/${id}/activate`)

// Chat
export const chatCompletion = (payload: Record<string, unknown>) =>
  apiClient.post('/chat/completions', payload)

// Models
const buildSearchParams = (filters?: ModelSearchFilters) => {
  if (!filters) return ''
  const params = new URLSearchParams()
  if (filters.task) params.set('task', filters.task)
  if (filters.library) params.set('library', filters.library)
  if (filters.license) params.set('license', filters.license)
  if (filters.framework) params.set('framework', filters.framework)
  if (filters.language) params.set('language', filters.language)
  if (filters.author) params.set('author', filters.author)
  if (filters.sort_by) params.set('sort_by', filters.sort_by)
  if (filters.sort_dir !== undefined) params.set('sort_dir', String(filters.sort_dir))
  if (filters.min_params !== undefined) params.set('min_params', String(filters.min_params))
  if (filters.max_params !== undefined) params.set('max_params', String(filters.max_params))
  if (filters.quantization) params.set('quantization', filters.quantization)
  if (filters.format) params.set('format', filters.format)
  if (filters.fits_gpu) params.set('fits_gpu', 'true')
  if (filters.multimodal) params.set('multimodal', 'true')
  const s = params.toString()
  return s ? `&${s}` : ''
}

export const searchModels = (query: string, limit: number = 20, filters?: ModelSearchFilters) =>
  apiClient.get<{ models: HFModel[]; gpu?: GPUInfo }>(`/models/search?query=${encodeURIComponent(query)}&limit=${limit}${buildSearchParams(filters)}`)
export const downloadModel = (repo_id: string, revision: string = 'main') =>
  apiClient.post('/models/download', { repo_id, revision })
export const getDownloadStatus = (repo_id: string) =>
  apiClient.get(`/models/download-status/${encodeURIComponent(repo_id)}`)
export const listLocalModels = () => apiClient.get('/models/local')
export const scanLocalModels = () => apiClient.get<{ models: LocalModel[]; gpu: GPUInfo; scanned_dirs: string[] }>('/models/local-scan')
export const locateModel = (repo_id: string) =>
  apiClient.get<LocateModelResponse>(`/models/locate/${encodeURIComponent(repo_id)}`)
export const deleteModel = (repo_id: string) =>
  apiClient.delete<DeleteModelResponse>(`/models/local/${encodeURIComponent(repo_id)}`)
export const deployModel = (config: {
  repo_id: string; quantization?: string; dtype?: string; context_length?: number;
  tensor_parallel_size?: number; host?: string; port?: number; trust_remote_code?: boolean;
  tool_call_parser?: string; reasoning_parser?: string; enable_multimodal?: boolean; load_format?: string;
}) => apiClient.post('/models/deploy', config)
export const getGPUProcesses = () => apiClient.get('/models/gpu-processes')
export const getGPULiveStatus = () => apiClient.get<GPULiveStatus>('/models/gpu-live')
export const getModelCard = (repo_id: string) =>
  apiClient.get(`/models/card/${encodeURIComponent(repo_id)}`)
export const getModelInfo_ = (repo_id: string) =>
  apiClient.get(`/models/info/${encodeURIComponent(repo_id)}`)
export const validateHFToken = () => apiClient.get('/models/validate-token')
export const getGPUInfo = () => apiClient.get<GPUInfo>('/models/gpu')

// Metrics
export const getLatestMetrics = () => apiClient.get<MetricsSnapshot>('/metrics/latest')
export const getMetricsHistory = (seconds: number = 300) =>
  apiClient.get<{ metrics: MetricsSnapshot[] }>(`/metrics/history?seconds=${seconds}`)

// ZeroTier
export const getZTStatus = () => apiClient.get<ZeroTierStatus>('/zerotier/status')
export const joinZTNetwork = (network_id: string) =>
  apiClient.post('/zerotier/join', { network_id })
export const leaveZTNetwork = (network_id: string) =>
  apiClient.post('/zerotier/leave', { network_id })

// Settings
export const getSettings = () => apiClient.get('/settings/')
export const updateSetting = (key: string, value: unknown) =>
  apiClient.put('/settings/', { key, value })
export const saveHuggingFaceToken = (token: string) =>
  apiClient.post('/settings/huggingface-token', { token })
export const restartProject = () =>
  apiClient.post('/settings/restart')
export const restartAndRebuild = () =>
  apiClient.post('/settings/restart-and-rebuild')

// Updates
export const checkUpdates = () => apiClient.get<UpdateCheckResponse>('/update/check')
export const downloadUpdate = (url: string) =>
  apiClient.post(`/update/download?url=${encodeURIComponent(url)}`)
export const getUpdateStatus = () => apiClient.get<UpdateStatus>('/update/status')
export const applyUpdate = () => apiClient.post('/update/apply')
export const cancelUpdate = () => apiClient.post('/update/cancel')

// Diagnostics
export const runDiagnostics = (full = false) => apiClient.get<{ can_run: boolean; checks: Array<{ name: string; ok: boolean; message: string; fix?: string; severity: string; full_error?: string }>; errors: string[]; warnings: string[]; fix_suggestions: string[]; versions: Record<string, string>; python: string }>(`/diagnostics/${full ? '?full=1' : ''}`)
export const getVersions = () => apiClient.get<{ python: string; versions: Record<string, string> }>('/diagnostics/versions')
export const autoFix = (checkName: string) => apiClient.post<{ status: string; message: string; error_tail?: string; stdout_tail?: string }>(`/diagnostics/fix/${checkName}`)

// Benchmark
export const runBenchmark = (config: Record<string, unknown>) =>
  apiClient.post<BenchmarkResult>('/benchmark/run', config)
export const getBenchmarkStatus = () => apiClient.get<BenchmarkStatus>('/benchmark/status')
export const cancelBenchmark = () => apiClient.post('/benchmark/cancel')

// TTS/STT
export const tts = (text: string, voice: string = 'default', speed: number = 1.0) =>
  apiClient.post('/audio/tts', { text, voice, speed }, { responseType: 'blob' })
export const stt = (audioBlob: Blob, language?: string) => {
  const form = new FormData()
  form.append('file', audioBlob, 'audio.wav')
  if (language) form.append('language', language)
  return apiClient.post<{ text: string }>('/audio/stt', form)
}
