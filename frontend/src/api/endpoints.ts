import apiClient from './client'
import type { ServerStatus, MetricsSnapshot, HFModel, ZeroTierStatus, ServerProfile, BenchmarkResult, BenchmarkStatus, UpdateStatus, UpdateCheckResponse } from '../types'

// Auth
export const checkSetupStatus = () => apiClient.get('/auth/setup-status')
export const setupAdmin = (data: { username: string; email: string; password: string; server_port?: number }) =>
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
export const searchModels = (query: string, limit: number = 20, task?: string) =>
  apiClient.get<{ models: HFModel[] }>(`/models/search?query=${encodeURIComponent(query)}&limit=${limit}${task ? `&task=${task}` : ''}`)
export const downloadModel = (repo_id: string, revision: string = 'main') =>
  apiClient.post('/models/download', { repo_id, revision })
export const getDownloadStatus = (repo_id: string) =>
  apiClient.get(`/models/download-status/${encodeURIComponent(repo_id)}`)
export const listLocalModels = () => apiClient.get('/models/local')
export const getModelCard = (repo_id: string) =>
  apiClient.get(`/models/card/${encodeURIComponent(repo_id)}`)
export const getModelInfo_ = (repo_id: string) =>
  apiClient.get(`/models/info/${encodeURIComponent(repo_id)}`)

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

// Updates
export const checkUpdates = () => apiClient.get<UpdateCheckResponse>('/update/check')
export const downloadUpdate = (url: string) =>
  apiClient.post(`/update/download?url=${encodeURIComponent(url)}`)
export const getUpdateStatus = () => apiClient.get<UpdateStatus>('/update/status')
export const applyUpdate = () => apiClient.post('/update/apply')
export const cancelUpdate = () => apiClient.post('/update/cancel')

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
