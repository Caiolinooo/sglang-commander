import { create } from 'zustand'
import type { ServerProfile, HFModel, LocalModel, GPULiveStatus, GPUInfo, MetricsSnapshot, ModelSearchFilters } from '../types'
import {
  getServerStatus,
  getServerLogs,
  listServerProfiles,
  getActiveProfile,
  scanLocalModels,
  getGPULiveStatus,
  validateModel,
  searchModels,
  downloadModel,
  deleteModel,
  getGPUInfo,
  listConversations,
  createConversation,
  deleteConversation,
  getConversationMessages,
  saveConversationMessages,
  updateConversationTitle,
  getLatestMetrics,
  getMetricsHistory,
  startServer as apiStartServer,
  stopServer as apiStopServer,
  restartServer as apiRestartServer
} from '../api/endpoints'
import { validateConfig } from '../utils/validation'
import type { ValidationIssue } from '../utils/validation'

// Types for Chat
export interface ChatMetrics {
  tokensGenerated: number
  elapsedMs: number
  tokensPerSec: number
  promptTokens: number
}

export interface ToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  metrics?: ChatMetrics
  tool_calls?: ToolCall[]
  tool_call_id?: string
  reasoning_content?: string
}

// Types for SSH Connections
export interface SSHConnection {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKey?: string
  status?: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
}

// RAG Types
export interface RAGDocument {
  id: string
  name: string
  collection: string
  size: number
  uploadedAt: string
}

// ----------------------------------------------------
// SERVER STORE
// ----------------------------------------------------
interface AdvancedConfig {
  mem_fraction_static: number
  chunked_prefill_size: number
  cuda_graph_max_bs: number
  enable_metrics: boolean
  reasoning_parser: string
  tool_call_parser: string
  schedule_policy: string
  max_running_requests: number
  max_prefill_tokens: number
  disable_mixed_chunk: boolean
  enable_dp_attention: boolean
  disable_overlap_schedule: boolean
  nccl_num_groups: number
  dist_init_addr: string
  chat_template: string
  grammar_backend: string
  load_format: string
  is_embedding: boolean
  log_level: string
  kv_cache_dtype: string
  cpu_offload_gb: number
  disable_cuda_graph: boolean
  ep_size: number
  moe_runner_backend: string
  speculative_algorithm: string
  speculative_num_steps: number
  speculative_draft_model_path: string
  pp_size: number
}

interface ServerState {
  status: { running: boolean; health: string; pid: number | null; model_path: string; uptime_seconds: number | null }
  profiles: ServerProfile[]
  activeProfile: ServerProfile | null
  logs: string[]
  cursor: number
  loading: boolean
  localModels: LocalModel[]
  scannedDirs: string[]
  gpuStatus: GPULiveStatus | null
  validation: any | null
  selectedModel: LocalModel | null
  flagIssues: ValidationIssue[]
  config: {
    model_path: string
    host: string
    port: number
    tensor_parallel_size: number
    quantization: string
    dtype: string
    context_length: number
    enable_multimodal: boolean
    trust_remote_code: boolean
    extra_args: Record<string, unknown>
  }
  advanced: AdvancedConfig
  tab: 'config' | 'logs' | 'gpu'
  showAdvanced: boolean
  
  setTab: (tab: 'config' | 'logs' | 'gpu') => void
  setShowAdvanced: (show: boolean) => void
  setConfig: (updater: (prev: ServerState['config']) => ServerState['config']) => void
  setAdvanced: (updater: (prev: AdvancedConfig) => AdvancedConfig) => void
  setSelectedModel: (model: LocalModel | null) => void
  
  fetchStatus: () => Promise<void>
  fetchLogs: () => Promise<void>
  fetchProfiles: () => Promise<void>
  scanModels: () => Promise<void>
  fetchGPU: () => Promise<void>
  runValidation: () => Promise<void>
  loadProfile: (profile: ServerProfile) => void
  selectLocalModel: (model: LocalModel) => void
  startServer: () => Promise<void>
  stopServer: () => Promise<void>
  restartServer: () => Promise<void>
  updateFlagIssues: () => void
}

export const useServerStore = create<ServerState>((set, get) => ({
  status: { running: false, health: 'stopped', pid: null, model_path: '', uptime_seconds: null },
  profiles: [],
  activeProfile: null,
  logs: [],
  cursor: 0,
  loading: false,
  localModels: [],
  scannedDirs: [],
  gpuStatus: null,
  validation: null,
  selectedModel: null,
  flagIssues: [],
  config: {
    model_path: '', host: '127.0.0.1', port: 30000, tensor_parallel_size: 1,
    quantization: '', dtype: 'auto', context_length: 0, enable_multimodal: false, trust_remote_code: false,
    extra_args: {},
  },
  advanced: {
    mem_fraction_static: 0.88, chunked_prefill_size: 8192, cuda_graph_max_bs: 128, enable_metrics: true,
    reasoning_parser: '', tool_call_parser: '', schedule_policy: 'lpm', max_running_requests: 0,
    max_prefill_tokens: 0, disable_mixed_chunk: false, enable_dp_attention: false, disable_overlap_schedule: false,
    nccl_num_groups: 1, dist_init_addr: '', chat_template: '', grammar_backend: '', load_format: '',
    is_embedding: false, log_level: '', kv_cache_dtype: '', cpu_offload_gb: 0, disable_cuda_graph: false,
    ep_size: 1, moe_runner_backend: '', speculative_algorithm: '', speculative_num_steps: 3,
    speculative_draft_model_path: '', pp_size: 1
  },
  tab: 'config',
  showAdvanced: false,

  setTab: (tab) => set({ tab }),
  setShowAdvanced: (showAdvanced) => set({ showAdvanced }),
  setConfig: (updater) => set((state) => ({ config: updater(state.config) })),
  setAdvanced: (updater) => set((state) => ({ advanced: updater(state.advanced) })),
  setSelectedModel: (selectedModel) => set({ selectedModel }),

  fetchStatus: async () => {
    try {
      const s = await getServerStatus()
      set({ status: { running: s.data.running, health: s.data.health || 'stopped', pid: s.data.pid || null, model_path: s.data.model_path || '', uptime_seconds: s.data.uptime_seconds || null } })
    } catch {}
  },
  fetchLogs: async () => {
    try {
      const r = await getServerLogs(get().cursor)
      if (r.data.lines?.length) {
        set((state) => ({ logs: [...state.logs, ...r.data.lines], cursor: r.data.cursor }))
      }
    } catch {}
  },
  fetchProfiles: async () => {
    try {
      const [p, a] = await Promise.all([listServerProfiles(), getActiveProfile()])
      set({ profiles: p.data, activeProfile: a.data })
    } catch {}
  },
  scanModels: async () => {
    try {
      const r = await scanLocalModels()
      set({ localModels: r.data.models || [], scannedDirs: r.data.scanned_dirs || [] })
    } catch {}
  },
  fetchGPU: async () => {
    try {
      const r = await getGPULiveStatus()
      set({ gpuStatus: r.data })
    } catch {}
  },
  runValidation: async () => {
    const { config } = get()
    if (!config.model_path) return
    try {
      const r = await validateModel(config)
      set({ validation: r.data })
    } catch (e: any) {
      if (e.response?.data?.detail) {
        const detail = e.response.data.detail
        set({
          validation: {
            valid: false,
            errors: detail.errors || [detail.message || 'Validation failed'],
            warnings: detail.warnings || [],
            suggestions: detail.suggestions || [],
            model_info: detail.model_info,
          }
        })
      } else {
        set({ validation: { valid: false, errors: [e.message || 'Validation failed'], warnings: [], suggestions: [] } })
      }
    }
  },
  loadProfile: (profile) => {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(profile.args_json || '{}') } catch {}
    set({
      config: {
        model_path: profile.model_path, host: profile.host, port: profile.port,
        tensor_parallel_size: (args.tensor_parallel_size as number) || 1,
        quantization: (args.quantization as string) || '',
        dtype: (args.dtype as string) || 'auto',
        context_length: (args.context_length as number) || 0,
        enable_multimodal: (args.enable_multimodal as boolean) || false,
        trust_remote_code: (args.trust_remote_code as boolean) || false,
        extra_args: args.extra_args as Record<string, unknown> || {},
      },
      selectedModel: null,
      validation: null
    })
  },
  selectLocalModel: (model) => {
    const quant = model.recommended_quant || model.quantization || ''
    set({
      selectedModel: model,
      config: {
        model_path: model.repo_id,
        host: get().config.host,
        port: get().config.port,
        quantization: quant,
        context_length: model.context_length || 0,
        dtype: 'auto',
        trust_remote_code: true,
        enable_multimodal: model.is_moe ? false : (model.architectures?.some(a => a.toLowerCase().includes('vision') || a.toLowerCase().includes('conditional')) || false),
        tensor_parallel_size: get().config.tensor_parallel_size,
        extra_args: {}
      },
      tab: 'config'
    })
  },
  updateFlagIssues: () => {
    const { selectedModel, config, advanced, gpuStatus } = get()
    if (!selectedModel) { set({ flagIssues: [] }); return }
    const g0 = gpuStatus?.gpus?.[0] || null
    const result = validateConfig({
      model_name: selectedModel.model_name,
      params_billions: selectedModel.params_billions || 0,
      quantization: config.quantization || selectedModel.quantization || '',
      dtype: config.dtype,
      context_length: config.context_length || selectedModel.context_length || 4096,
      tensor_parallel_size: config.tensor_parallel_size,
      ep_size: advanced.ep_size,
      pp_size: advanced.pp_size,
      kv_cache_dtype: advanced.kv_cache_dtype,
      mem_fraction_static: advanced.mem_fraction_static,
      cpu_offload_gb: advanced.cpu_offload_gb,
      max_running_requests: advanced.max_running_requests,
      enable_multimodal: config.enable_multimodal,
      trust_remote_code: config.trust_remote_code,
      enable_dp_attention: advanced.enable_dp_attention,
      disable_cuda_graph: advanced.disable_cuda_graph,
      speculative_algorithm: advanced.speculative_algorithm,
      speculative_num_steps: advanced.speculative_num_steps,
      speculative_draft_model_path: advanced.speculative_draft_model_path,
      load_format: advanced.load_format,
      tool_call_parser: advanced.tool_call_parser,
      reasoning_parser: advanced.reasoning_parser,
      total_vram_gb: g0?.total_mb ? g0.total_mb / 1024 : 24,
      free_vram_gb: g0?.free_mb ? g0.free_mb / 1024 : 22,
      num_gpus: gpuStatus?.count || 1,
      is_moe: selectedModel.is_moe || false,
      architectures: selectedModel.architectures || [],
    })
    set({ flagIssues: result.issues })
  },
  startServer: async () => {
    const { config, advanced } = get()
    set({ loading: true })
    const buildArgs = () => {
      const args: Record<string, unknown> = {}
      if (advanced.mem_fraction_static !== 0.88) args.mem_fraction_static = advanced.mem_fraction_static
      if (advanced.chunked_prefill_size !== 8192) args.chunked_prefill_size = advanced.chunked_prefill_size
      if (advanced.cuda_graph_max_bs !== 128) args.cuda_graph_max_bs = advanced.cuda_graph_max_bs
      if (advanced.enable_metrics !== true) args.enable_metrics = advanced.enable_metrics
      if (advanced.reasoning_parser) args.reasoning_parser = advanced.reasoning_parser
      if (advanced.tool_call_parser) args.tool_call_parser = advanced.tool_call_parser
      if (advanced.schedule_policy !== 'lpm') args.schedule_policy = advanced.schedule_policy
      if (advanced.max_running_requests > 0) args.max_running_requests = advanced.max_running_requests
      if (advanced.max_prefill_tokens > 0) args.max_prefill_tokens = advanced.max_prefill_tokens
      if (advanced.disable_mixed_chunk) args.disable_mixed_chunk = true
      if (advanced.enable_dp_attention) args.enable_dp_attention = true
      if (advanced.disable_overlap_schedule) args.disable_overlap_schedule = true
      if (advanced.nccl_num_groups > 1) args.nccl_num_groups = advanced.nccl_num_groups
      if (advanced.dist_init_addr) args.dist_init_addr = advanced.dist_init_addr
      if (advanced.chat_template) args.chat_template = advanced.chat_template
      if (advanced.grammar_backend) args.grammar_backend = advanced.grammar_backend
      if (advanced.load_format) args.load_format = advanced.load_format
      if (advanced.is_embedding) args.is_embedding = true
      if (advanced.log_level) args.log_level = advanced.log_level
      if (advanced.kv_cache_dtype) args.kv_cache_dtype = advanced.kv_cache_dtype
      if (advanced.cpu_offload_gb > 0) args.cpu_offload_gb = advanced.cpu_offload_gb
      if (advanced.disable_cuda_graph) args.disable_cuda_graph = true
      if (advanced.ep_size > 1) args.ep_size = advanced.ep_size
      if (advanced.moe_runner_backend) args.moe_runner_backend = advanced.moe_runner_backend
      if (advanced.speculative_algorithm) args.speculative_algorithm = advanced.speculative_algorithm
      if (advanced.speculative_num_steps > 0) args.speculative_num_steps = advanced.speculative_num_steps
      if (advanced.speculative_draft_model_path) args.speculative_draft_model_path = advanced.speculative_draft_model_path
      if (advanced.pp_size > 1) args.pp_size = advanced.pp_size
      return args
    }

    const payload = {
      ...config,
      tool_call_parser: advanced.tool_call_parser || undefined,
      reasoning_parser: advanced.reasoning_parser || undefined,
      chat_template: advanced.chat_template || undefined,
      grammar_backend: advanced.grammar_backend || undefined,
      load_format: advanced.load_format || undefined,
      is_embedding: advanced.is_embedding || undefined,
      log_level: advanced.log_level || undefined,
      kv_cache_dtype: advanced.kv_cache_dtype || undefined,
      mem_fraction_static: advanced.mem_fraction_static !== 0.88 ? advanced.mem_fraction_static : undefined,
      cpu_offload_gb: advanced.cpu_offload_gb > 0 ? advanced.cpu_offload_gb : undefined,
      disable_cuda_graph: advanced.disable_cuda_graph || undefined,
      max_running_requests: advanced.max_running_requests > 0 ? advanced.max_running_requests : undefined,
      ep_size: advanced.ep_size > 1 ? advanced.ep_size : undefined,
      moe_runner_backend: advanced.moe_runner_backend || undefined,
      enable_dp_attention: advanced.enable_dp_attention || undefined,
      speculative_algorithm: advanced.speculative_algorithm || undefined,
      speculative_num_steps: advanced.speculative_algorithm ? advanced.speculative_num_steps : undefined,
      speculative_draft_model_path: advanced.speculative_draft_model_path || undefined,
      pp_size: advanced.pp_size > 1 ? advanced.pp_size : undefined,
      extra_args: buildArgs(),
    }

    try {
      await apiStartServer(payload)
      set({ logs: [], cursor: 0 })
    } catch (e: any) {
      if (e.response?.data?.detail) {
        const detail = e.response.data.detail
        set({
          validation: {
            valid: false,
            errors: detail.errors || [detail.message || 'Start failed'],
            warnings: detail.warnings || [],
            suggestions: detail.suggestions || [],
            model_info: detail.model_info,
          },
          tab: 'config'
        })
      }
      throw e
    } finally {
      set({ loading: false })
    }
  },
  stopServer: async () => {
    try {
      await apiStopServer()
      set((state) => ({ status: { ...state.status, running: false, health: 'stopped' } }))
    } catch {}
  },
  restartServer: async () => {
    const { config } = get()
    try {
      await apiRestartServer(config)
    } catch {}
  }
}))

// ----------------------------------------------------
// METRICS STORE
// ----------------------------------------------------
interface MetricsState {
  latest: MetricsSnapshot | null
  history: MetricsSnapshot[]
  loading: boolean
  fetchLatest: () => Promise<void>
  fetchHistory: (seconds?: number) => Promise<void>
}

export const useMetricsStore = create<MetricsState>((set) => ({
  latest: null,
  history: [],
  loading: false,
  fetchLatest: async () => {
    try {
      const r = await getLatestMetrics()
      set({ latest: r.data })
    } catch {}
  },
  fetchHistory: async (seconds = 300) => {
    try {
      const r = await getMetricsHistory(seconds)
      set({ history: r.data.metrics || [] })
    } catch {}
  }
}))

// ----------------------------------------------------
// MODELS STORE
// ----------------------------------------------------
interface ModelsState {
  query: string
  results: HFModel[]
  local: LocalModel[]
  searching: boolean
  downloading: string
  tab: 'quick' | 'hub' | 'local' | 'trending'
  gpuInfo: GPUInfo | null
  filters: ModelSearchFilters
  
  setQuery: (q: string) => void
  setTab: (tab: ModelsState['tab']) => void
  setFilters: (filters: ModelSearchFilters) => void
  clearFilters: () => void
  search: (q?: string) => Promise<void>
  download: (repoId: string) => Promise<void>
  fetchLocal: () => Promise<void>
  deleteLocalModel: (repoId: string) => Promise<void>
  fetchGPU: () => Promise<void>
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  query: '',
  results: [],
  local: [],
  searching: false,
  downloading: '',
  tab: 'quick',
  gpuInfo: null,
  filters: {},

  setQuery: (query) => set({ query }),
  setTab: (tab) => set({ tab }),
  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  search: async (q) => {
    const queryStr = q ?? get().query
    set({ searching: true })
    try {
      const resp = await searchModels(queryStr, 50, Object.keys(get().filters).length > 0 ? get().filters : undefined)
      set({ results: resp.data.models || [] })
      if (resp.data.gpu) set({ gpuInfo: resp.data.gpu })
    } catch {} finally { set({ searching: false }) }
  },
  download: async (repoId) => {
    set({ downloading: repoId })
    try {
      await downloadModel(repoId)
    } catch (e) {
      console.error(e)
    } finally {
      set({ downloading: '' })
      get().fetchLocal()
    }
  },
  fetchLocal: async () => {
    try {
      const resp = await scanLocalModels()
      set({ local: resp.data.models || [] })
      if (resp.data.gpu) set({ gpuInfo: resp.data.gpu })
    } catch {
      // Fallback
    }
  },
  deleteLocalModel: async (repoId) => {
    try {
      await deleteModel(repoId)
      get().fetchLocal()
    } catch (e) {
      console.error(e)
    }
  },
  fetchGPU: async () => {
    try {
      const resp = await getGPUInfo()
      set({ gpuInfo: resp.data })
    } catch {}
  }
}))

// ----------------------------------------------------
// CHAT STORE
// ----------------------------------------------------
interface ChatState {
  conversations: any[]
  activeConv: number | null
  messages: Message[]
  streaming: boolean
  model: string
  temp: number
  jsonMode: boolean
  thinkingMode: boolean
  error: string | null
  imageData: string | null
  imagePreview: string | null
  recording: boolean
  ragEnabled: boolean
  ragCollections: string[]
  ragDocuments: RAGDocument[]

  setModel: (m: string) => void
  setTemp: (t: number) => void
  setJsonMode: (j: boolean) => void
  setThinkingMode: (t: boolean) => void
  setImageData: (d: string | null) => void
  setImagePreview: (p: string | null) => void
  setRecording: (r: boolean) => void
  setRagEnabled: (e: boolean) => void
  
  fetchConversations: () => Promise<void>
  loadConversation: (id: number) => Promise<void>
  newConversation: () => Promise<void>
  deleteConversation: (id: number) => Promise<void>
  sendMessage: (inputText: string) => Promise<void>
  uploadRagDocument: (collection: string, file: File) => Promise<void>
  deleteRagDocument: (id: string) => Promise<void>
  createRagCollection: (name: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConv: null,
  messages: [{ role: 'assistant', content: "Hello! I'm your SGLang model. Send a message to start chatting." }],
  streaming: false,
  model: '',
  temp: 0.7,
  jsonMode: false,
  thinkingMode: false,
  error: null,
  imageData: null,
  imagePreview: null,
  recording: false,
  ragEnabled: false,
  ragCollections: ['Default-Knowledge'],
  ragDocuments: [],

  setModel: (model) => set({ model }),
  setTemp: (temp) => set({ temp }),
  setJsonMode: (jsonMode) => set({ jsonMode }),
  setThinkingMode: (thinkingMode) => set({ thinkingMode }),
  setImageData: (imageData) => set({ imageData }),
  setImagePreview: (imagePreview) => set({ imagePreview }),
  setRecording: (recording) => set({ recording }),
  setRagEnabled: (ragEnabled) => set({ ragEnabled }),

  fetchConversations: async () => {
    try {
      const r = await listConversations()
      set({ conversations: r.data || [] })
    } catch {}
  },
  loadConversation: async (id) => {
    try {
      const resp = await getConversationMessages(id)
      const msgs = resp.data?.messages || []
      set({
        messages: msgs.length > 0 ? msgs : [{ role: 'assistant', content: "Hello! I'm your SGLang model. Send a message to start chatting." }],
        activeConv: id,
        error: null
      })
    } catch {}
  },
  newConversation: async () => {
    try {
      const resp = await createConversation()
      const conv = resp.data
      set((state) => ({
        activeConv: conv.id,
        conversations: [conv, ...state.conversations],
        messages: [{ role: 'assistant', content: "Hello! I'm your SGLang model. Send a message to start chatting." }],
        error: null
      }))
    } catch {}
  },
  deleteConversation: async (id) => {
    try {
      await deleteConversation(id)
      set((state) => ({
        conversations: state.conversations.filter(c => c.id !== id),
        activeConv: state.activeConv === id ? null : state.activeConv,
        messages: state.activeConv === id ? [{ role: 'assistant', content: "Hello! I'm your SGLang model. Send a message to start chatting." }] : state.messages
      }))
    } catch {}
  },
  sendMessage: async (inputText) => {
    const { model, temp, jsonMode, thinkingMode, messages, imageData, activeConv, streaming } = get()
    if (!inputText.trim() || streaming) return
    set({ error: null, streaming: true })

    const content = imageData
      ? [
          { type: 'text', text: inputText },
          { type: 'image_url', image_url: { url: imageData } }
        ]
      : inputText

    const userMsg: Message = { role: 'user', content: imageData ? inputText : inputText }
    const assistantMsg: Message = { role: 'assistant', content: '' }

    set((state) => ({
      messages: [...state.messages, userMsg, assistantMsg],
      imageData: null,
      imagePreview: null
    }))

    const startTime = performance.now()
    let tokenCount = 0
    let promptTokens = 0

    try {
      const token = localStorage.getItem('access_token')
      const payload: Record<string, unknown> = {
        model: model || 'default',
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        temperature: temp,
        max_tokens: 4096,
        stream: true,
      }
      if (imageData) {
        payload.messages = [...messages, { ...userMsg, content }].map(m => ({ role: m.role, content: m.content }))
      }
      if (jsonMode) {
        payload.response_format = { type: 'json_object' }
      }
      if (thinkingMode) {
        payload.enable_thinking = true
      }
      if (get().ragEnabled) {
        payload.rag_enabled = true
        payload.rag_collections = get().ragCollections
      }

      const resp = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      })

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '')
        throw new Error(`Server error ${resp.status}: ${errBody.slice(0, 200)}`)
      }

      const reader = resp.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let reasoningContent = ''

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.error) throw new Error(parsed.error)
              const delta = parsed.choices?.[0]?.delta
              const textContent = delta?.content || ''
              const rc = delta?.reasoning_content || ''

              if (rc) reasoningContent += rc
              if (textContent) tokenCount++
              if (parsed.usage?.prompt_tokens) promptTokens = parsed.usage.prompt_tokens

              set((state) => ({
                messages: state.messages.map((m, idx) => {
                  if (idx !== state.messages.length - 1) return m
                  return {
                    ...m,
                    content: m.content + textContent,
                    reasoning_content: reasoningContent || undefined
                  }
                })
              }))
            } catch (err) {
              if (err instanceof Error && err.message !== 'Unexpected end of JSON input') {
                throw err
              }
            }
          }
        }
      }

      const elapsedMs = performance.now() - startTime
      const metrics: ChatMetrics = {
        tokensGenerated: tokenCount,
        elapsedMs,
        tokensPerSec: tokenCount > 0 ? (tokenCount / (elapsedMs / 1000)) : 0,
        promptTokens
      }

      set((state) => ({
        messages: state.messages.map((m, idx) => {
          if (idx !== state.messages.length - 1) return m
          return { ...m, metrics }
        })
      }))

      // Auto-save
      if (activeConv) {
        const msgs = get().messages.filter(m => m.content || m.tool_calls)
        await saveConversationMessages(activeConv, msgs)
        const firstUser = msgs.find(m => m.role === 'user')
        if (firstUser) {
          const title = typeof firstUser.content === 'string' ? firstUser.content.slice(0, 80) : 'Chat with image'
          await updateConversationTitle(activeConv, title)
          get().fetchConversations()
        }
      }
    } catch (e: any) {
      const msg = e.message || String(e)
      set({ error: msg })
      set((state) => ({
        messages: state.messages.map((m, idx) => {
          if (idx === state.messages.length - 1 && m.role === 'assistant' && !m.content) {
            return { ...m, content: `Error: ${msg}` }
          }
          return m
        })
      }))
    } finally {
      set({ streaming: false })
    }
  },

  // RAG Actions
  uploadRagDocument: async (collection, file) => {
    // Simulated upload for frontend
    const newDoc: RAGDocument = {
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      collection,
      size: Math.round(file.size / 1024), // KB
      uploadedAt: new Date().toISOString()
    }
    set((state) => ({
      ragDocuments: [...state.ragDocuments, newDoc]
    }))
  },
  deleteRagDocument: async (id) => {
    set((state) => ({
      ragDocuments: state.ragDocuments.filter(d => d.id !== id)
    }))
  },
  createRagCollection: (name) => {
    set((state) => {
      if (state.ragCollections.includes(name)) return state
      return { ragCollections: [...state.ragCollections, name] }
    })
  }
}))

// ----------------------------------------------------
// SSH CONNECTIONS STORE
// ----------------------------------------------------
interface ConnectionsState {
  connections: SSHConnection[]
  activeConnectionId: string | null
  addConnection: (conn: Omit<SSHConnection, 'id' | 'status'>) => void
  updateConnection: (id: string, conn: Partial<SSHConnection>) => void
  deleteConnection: (id: string) => void
  setActiveConnection: (id: string | null) => void
  loadConnections: () => void
  testConnection: (id: string) => Promise<boolean>
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  activeConnectionId: null,

  loadConnections: () => {
    const list = localStorage.getItem('ssh_connections')
    const active = localStorage.getItem('active_ssh_connection_id')
    if (list) {
      set({ connections: JSON.parse(list) })
    }
    if (active) {
      set({ activeConnectionId: active })
    }
  },

  addConnection: (conn) => {
    const newConn: SSHConnection = {
      ...conn,
      id: Math.random().toString(36).substr(2, 9),
      status: 'disconnected'
    }
    const connections = [...get().connections, newConn]
    localStorage.setItem('ssh_connections', JSON.stringify(connections))
    set({ connections })
  },

  updateConnection: (id, conn) => {
    const connections = get().connections.map(c => c.id === id ? { ...c, ...conn } : c)
    localStorage.setItem('ssh_connections', JSON.stringify(connections))
    set({ connections })
  },

  deleteConnection: (id) => {
    const connections = get().connections.filter(c => c.id !== id)
    const activeId = get().activeConnectionId === id ? null : get().activeConnectionId
    localStorage.setItem('ssh_connections', JSON.stringify(connections))
    localStorage.setItem('active_ssh_connection_id', activeId || '')
    set({ connections, activeConnectionId: activeId })
  },

  setActiveConnection: (id) => {
    localStorage.setItem('active_ssh_connection_id', id || '')
    set({ activeConnectionId: id })
  },

  testConnection: async (id) => {
    get().updateConnection(id, { status: 'connecting' })
    // Simulate test latency / connect
    await new Promise(resolve => setTimeout(resolve, 1500))
    const conn = get().connections.find(c => c.id === id)
    if (conn) {
      if (conn.host === 'invalid' || conn.host.includes('error')) {
        get().updateConnection(id, { status: 'error', error: 'Authentication failed or host unreachable' })
        return false
      }
      get().updateConnection(id, { status: 'connected', error: undefined })
      return true
    }
    return false
  }
}))

// ----------------------------------------------------
// UI STORE (Command Palette, General Settings)
// ----------------------------------------------------
interface UIState {
  showCommandPalette: boolean
  setShowCommandPalette: (show: boolean) => void
  toggleCommandPalette: () => void
}

export const useUIStore = create<UIState>((set) => ({
  showCommandPalette: false,
  setShowCommandPalette: (showCommandPalette) => set({ showCommandPalette }),
  toggleCommandPalette: () => set((state) => ({ showCommandPalette: !state.showCommandPalette }))
}))
