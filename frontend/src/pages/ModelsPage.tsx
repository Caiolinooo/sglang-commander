import { useState, useEffect, useCallback } from 'react'
import { searchModels, downloadModel, listLocalModels, scanLocalModels, locateModel, deleteModel, deployModel, getGPUInfo, getQuantVariants } from '../api/endpoints'
import type { HFModel, GPUInfo, LocalModel, LocateModelResponse, ModelSearchFilters } from '../types'
import { Search, Zap, HardDrive, Download, Heart, RefreshCw, Inbox, Database, Check, AlertTriangle, Cpu, TrendingUp, Layers, Play, Trash2, FolderOpen, X, Filter, SlidersHorizontal, Shield, Globe, Box } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/Button'

const QUICK_MODELS = [
  { repo_id: 'meta-llama/Llama-3.2-3B-Instruct', label: 'Llama 3.2 3B', category: 'llm', vram: 6, desc: 'Fast, efficient instruction-tuned model' },
  { repo_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct', label: 'Llama 3.2 11B Vision', category: 'vision', vram: 20, desc: 'Multimodal vision-language model' },
  { repo_id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B', category: 'llm', vram: 14, desc: 'Strong multilingual instruction model' },
  { repo_id: 'Qwen/Qwen2-VL-7B-Instruct', label: 'Qwen2-VL 7B', category: 'vision', vram: 16, desc: 'Vision-language understanding' },
  { repo_id: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B v0.3', category: 'llm', vram: 14, desc: 'Mixture of Experts architecture' },
  { repo_id: 'microsoft/Phi-3-mini-4k-instruct', label: 'Phi-3 Mini', category: 'llm', vram: 4, desc: 'Compact yet powerful reasoning' },
  { repo_id: 'BAAI/bge-small-en-v1.5', label: 'BGE Small (Embed)', category: 'embedding', vram: 1, desc: 'Fast text embeddings' },
  { repo_id: 'sentence-transformers/all-MiniLM-L6-v2', label: 'MiniLM (Embed)', category: 'embedding', vram: 1, desc: 'Lightweight sentence embeddings' },
  { repo_id: 'Systran/faster-whisper-base.en', label: 'Whisper Base (STT)', category: 'stt', vram: 2, desc: 'Fast speech recognition' },
  { repo_id: 'suno/bark', label: 'Bark (TTS)', category: 'tts', vram: 4, desc: 'Neural text-to-speech' },
]

const TRENDING_SEARCHES = ['llama', 'qwen', 'deepseek', 'whisper', 'mistral', 'phi-3', 'gemma', 'yi', 'command-r']

const FILTER_SECTIONS = [
  { id: 'task', label: 'Pipeline', icon: Layers, options: [
    { value: 'text-generation', label: 'Text Generation' },
    { value: 'image-text-to-text', label: 'Vision / Multimodal' },
    { value: 'text-embedding', label: 'Embeddings' },
    { value: 'automatic-speech-recognition', label: 'Speech-to-Text' },
    { value: 'text-to-speech', label: 'Text-to-Speech' },
  ]},
  { id: 'library', label: 'Library', icon: Database, options: [
    { value: 'transformers', label: 'Transformers' },
    { value: 'safetensors', label: 'SafeTensors' },
    { value: 'gguf', label: 'GGUF' },
    { value: 'pytorch', label: 'PyTorch' },
  ]},
  { id: 'license', label: 'License', icon: Shield, options: [
    { value: 'apache-2.0', label: 'Apache 2.0' },
    { value: 'mit', label: 'MIT' },
    { value: 'llama', label: 'Llama' },
    { value: 'gemma', label: 'Gemma' },
    { value: 'bsd', label: 'BSD' },
  ]},
  { id: 'language', label: 'Language', icon: Globe, options: [
    { value: 'en', label: 'English' },
    { value: 'zh', label: 'Chinese' },
    { value: 'multilingual', label: 'Multilingual' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'de', label: 'German' },
    { value: 'fr', label: 'French' },
    { value: 'es', label: 'Spanish' },
  ]},
  { id: 'params', label: 'Parameters', icon: Cpu, options: [
    { value: '0-1', label: '<1B' },
    { value: '1-3', label: '1-3B' },
    { value: '3-7', label: '3-7B' },
    { value: '7-14', label: '7-14B' },
    { value: '14-30', label: '14-30B' },
    { value: '30-70', label: '30-70B' },
    { value: '70+', label: '70B+' },
  ]},
  { id: 'quantization', label: 'Quantization', icon: Zap, options: [
    { value: 'none', label: 'None (Full)' },
    { value: 'awq', label: 'AWQ' },
    { value: 'fp8', label: 'FP8' },
    { value: 'gptq', label: 'GPTQ' },
  ]},
  { id: 'format', label: 'Format', icon: Box, options: [
    { value: 'safetensors', label: 'SafeTensors' },
    { value: 'gguf', label: 'GGUF' },
    { value: 'pytorch', label: 'PyTorch' },
  ]},
]

function detectToolCallParser(modelName: string): string {
  const n = modelName.toLowerCase()
  if (n.includes('llama-3') || n.includes('llama3')) return 'llama3'
  if (n.includes('qwen')) return 'qwen'
  if (n.includes('mistral') || n.includes('mixtral')) return 'mistral'
  if (n.includes('deepseek')) return 'deepseekv3'
  if (n.includes('glm')) return 'glm'
  return ''
}

function detectReasoningParser(modelName: string): string {
  const n = modelName.toLowerCase()
  if (n.includes('deepseek-r1') || n.includes('deepseek_r1')) return 'deepseek-r1'
  if (n.includes('qwen3')) return 'qwen3'
  return ''
}

function detectMultimodal(modelName: string, tags: string[]): boolean {
  const n = modelName.toLowerCase()
  const t = tags.join(' ').toLowerCase()
  return n.includes('-vl') || n.includes('vision') || n.includes('llava') || t.includes('image-text-to-text') || t.includes('vision')
}

function detectGGUF(modelName: string, tags: string[]): boolean {
  return modelName.toLowerCase().includes('.gguf') || tags.some(t => t.toLowerCase().includes('gguf'))
}

export default function ModelsPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HFModel[]>([])
  const [local, setLocal] = useState<LocalModel[]>([])
  const [searching, setSearching] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [tab, setTab] = useState<'quick' | 'hub' | 'local' | 'trending'>('quick')
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<ModelSearchFilters>({})

  const [selectedModel, setSelectedModel] = useState<HFModel | null>(null)
  const [showDeployDialog, setShowDeployDialog] = useState(false)
  const [deployConfig, setDeployConfig] = useState({
    quantization: '', dtype: 'auto', context_length: 0, tensor_parallel_size: 1,
    host: '127.0.0.1', port: 30000, trust_remote_code: true,
    tool_call_parser: '', reasoning_parser: '', enable_multimodal: false, load_format: '',
  })
  const [deploying, setDeploying] = useState(false)
  const [deployMsg, setDeployMsg] = useState('')

  const [locateResult, setLocateResult] = useState<LocateModelResponse | null>(null)
  const [showLocateDialog, setShowLocateDialog] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<LocalModel | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [quantVariants, setQuantVariants] = useState<Array<{ repo_id: string; quantization: string; downloads: number; likes: number; params_billions: number | null }>>([])
  const [loadingVariants, setLoadingVariants] = useState(false)

  useEffect(() => { handleRefresh(); fetchGPU() }, [])

  const fetchGPU = async () => {
    try { const resp = await getGPUInfo(); setGpuInfo(resp.data) } catch {}
  }

  const handleSearch = useCallback(async () => {
    const q = tab === 'trending' ? (query || 'large language model') : query
    if (tab === 'hub' && !q.trim() && Object.keys(filters).length === 0) return
    setSearching(true)
    try {
      const resp = await searchModels(q, 50, Object.keys(filters).length > 0 ? filters : undefined)
      setResults(resp.data.models || [])
      if (resp.data.gpu) setGpuInfo(resp.data.gpu)
    } catch {} finally { setSearching(false) }
  }, [query, tab, filters])

  useEffect(() => {
    if (tab === 'hub' || tab === 'trending') handleSearch()
  }, [tab, filters])

  const setFilter = (key: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev }
      if (value) (next as any)[key] = value
      else delete (next as any)[key]
      return next
    })
  }

  const clearFilters = () => {
    setFilters({})
  }

  const handleDownload = async (repoId: string) => {
    setDownloading(repoId)
    try { await downloadModel(repoId) } catch (e) { console.error(e) }
    setDownloading('')
    setTimeout(handleRefresh, 2000)
  }

  const handleRefresh = async () => {
    try {
      const resp = await scanLocalModels()
      setLocal(resp.data.models || [])
      if (resp.data.gpu) setGpuInfo(resp.data.gpu)
    } catch {
      try {
        const l = await listLocalModels()
        setLocal(((l as any).data || []).map((m: any) => ({
          repo_id: m.repo_id, model_name: m.repo_id.split('/').pop() || m.repo_id,
          local_path: '', size_gb: m.size_gb || 0, format: 'unknown', quantization: '',
          params_billions: null, vram_estimate_gb: 0, fits_in_gpu: false,
          context_length: 4096, architectures: [],
        })))
      } catch {}
    }
  }

  const openDeployDialog = async (model: HFModel) => {
    setSelectedModel(model)
    const name = model.model_name
    setDeployConfig({
      quantization: model.quantization || '',
      dtype: 'auto',
      context_length: model.context_length || 4096,
      tensor_parallel_size: 1,
      host: '127.0.0.1',
      port: 30000,
      trust_remote_code: true,
      tool_call_parser: detectToolCallParser(name),
      reasoning_parser: detectReasoningParser(name),
      enable_multimodal: detectMultimodal(name, model.tags),
      load_format: detectGGUF(name, model.tags) ? 'gguf' : '',
    })
    setShowDeployDialog(true)

    // Fetch quantization variants
    setLoadingVariants(true)
    try {
      const resp = await getQuantVariants(model.repo_id)
      setQuantVariants(resp.data.variants || [])
    } catch {} finally { setLoadingVariants(false) }
  }

  const openDeployDialogFromLocal = (model: LocalModel) => {
    const name = model.model_name
    setDeployConfig({
      quantization: model.quantization || '',
      dtype: 'auto',
      context_length: model.context_length || 4096,
      tensor_parallel_size: 1,
      host: '127.0.0.1',
      port: 30000,
      trust_remote_code: true,
      tool_call_parser: detectToolCallParser(name),
      reasoning_parser: detectReasoningParser(name),
      enable_multimodal: detectMultimodal(name, model.architectures),
      load_format: model.format === 'gguf' ? 'gguf' : '',
    })
    setShowDeployDialog(true)
  }

  const handleDeploy = async () => {
    if (!selectedModel) return
    setDeploying(true)
    setDeployMsg('Starting server...')
    try {
      await deployModel({
        repo_id: selectedModel.repo_id,
        quantization: deployConfig.quantization || undefined,
        dtype: deployConfig.dtype,
        context_length: deployConfig.context_length || undefined,
        tensor_parallel_size: deployConfig.tensor_parallel_size,
        host: deployConfig.host,
        port: deployConfig.port,
        trust_remote_code: deployConfig.trust_remote_code,
        tool_call_parser: deployConfig.tool_call_parser || undefined,
        reasoning_parser: deployConfig.reasoning_parser || undefined,
        enable_multimodal: deployConfig.enable_multimodal || undefined,
        load_format: deployConfig.load_format || undefined,
      })
      setDeployMsg('Server started!')
      setTimeout(() => { setShowDeployDialog(false); setDeployMsg('') }, 1500)
    } catch (e: any) {
      setDeployMsg(`Failed: ${e?.response?.data?.detail || e.message}`)
    } finally { setDeploying(false) }
  }

  const handleLocate = async (repoId: string) => {
    try {
      const resp = await locateModel(repoId)
      setLocateResult(resp.data)
      setShowLocateDialog(true)
    } catch (e) { console.error(e) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteModel(deleteTarget.repo_id)
      setShowDeleteDialog(false)
      setDeleteTarget(null)
      handleRefresh()
    } catch (e) { console.error(e) }
    setDeleting(false)
  }

  const fmtNum = (n: number) => { if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`; if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`; return String(n) }

  const CompatibilityBadge = ({ fits, vram }: { fits?: boolean; vram?: number }) => {
    if (!vram || vram === 0) return null
    if (fits) return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success border border-success/20"><Check size={10} /> Fits ({vram}GB)</span>
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/20"><AlertTriangle size={10} /> {vram}GB needed</span>
  }

  const FormatBadge = ({ format }: { format?: string }) => {
    if (!format || format === 'unknown') return null
    const colors: Record<string, string> = { safetensors: 'bg-success/15 text-success border-success/20', gguf: 'bg-info/15 text-info border-info/20', pytorch: 'bg-warning/15 text-warning border-warning/20' }
    return <span className={cn("inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border uppercase", colors[format] || 'bg-surface-2 text-text-muted border-border')}>{format}</span>
  }

  const QuantBadge = ({ quant }: { quant?: string }) => {
    if (!quant) return null
    return <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border uppercase bg-primary/15 text-primary border-primary/20">{quant}</span>
  }

  const FilterSidebar = () => (
    <div className="space-y-1">
      {FILTER_SECTIONS.map(section => {
        const Icon = section.icon
        const isActive = section.options.some(o => (filters as any)[section.id] === o.value)
        return (
          <div key={section.id} className="border border-border rounded-lg overflow-hidden">
            <button onClick={() => {
              const el = document.getElementById(`filter-${section.id}`)
              if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'
            }}
              className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                isActive ? "bg-primary/10 text-primary" : "text-text-muted hover:text-text hover:bg-surface-2")}>
              <Icon size={14} />
              <span>{section.label}</span>
              {isActive && <Badge variant="success" className="ml-auto text-[9px] py-0">active</Badge>}
            </button>
            <div id={`filter-${section.id}`} className="px-2 pb-2 space-y-0.5" style={{ display: isActive ? 'block' : 'none' }}>
              {section.options.map(opt => {
                const selected = (filters as any)[section.id] === opt.value
                return (
                  <button key={opt.value} onClick={() => setFilter(section.id, selected ? '' : opt.value)}
                    className={cn("w-full text-left px-2 py-1 text-xs rounded transition-colors",
                      selected ? "bg-primary/15 text-primary font-medium" : "text-text-muted hover:text-text hover:bg-surface-2")}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  const DeployDialog = () => {
    if (!showDeployDialog || !selectedModel) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDeployDialog(false)}>
        <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-text">Deploy Model</h3>
              <p className="text-sm text-text-muted">{selectedModel.repo_id}</p>
            </div>
            <button onClick={() => setShowDeployDialog(false)} className="text-text-muted hover:text-text"><X size={20} /></button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Quantization</label>
                <select value={deployConfig.quantization} onChange={e => setDeployConfig(p => ({ ...p, quantization: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border text-sm text-text">
                  <option value="">Auto</option>
                  <option value="awq">AWQ</option>
                  <option value="fp8">FP8</option>
                  <option value="gptq">GPTQ</option>
                </select>
                {quantVariants.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-text-muted font-medium">Available on HuggingFace:</p>
                    <div className="flex flex-wrap gap-1">
                      {quantVariants.slice(0, 6).map(v => (
                        <button key={v.repo_id} onClick={() => {
                          setDeployConfig(p => ({ ...p, quantization: v.quantization }))
                          setSelectedModel(prev => prev ? { ...prev, repo_id: v.repo_id } : prev)
                        }}
                          className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                            deployConfig.quantization === v.quantization ? "bg-primary/15 text-primary border-primary" : "bg-surface-2 text-text-muted border-border hover:border-primary")}>
                          {v.quantization.toUpperCase()} ({(v.downloads / 1000).toFixed(0)}K)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {loadingVariants && <p className="text-[10px] text-text-muted animate-pulse">Loading variants...</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Dtype</label>
                <select value={deployConfig.dtype} onChange={e => setDeployConfig(p => ({ ...p, dtype: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border text-sm text-text">
                  {['auto', 'half', 'bfloat16', 'float32'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Context Length</label>
                <Input type="number" value={deployConfig.context_length} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeployConfig(p => ({ ...p, context_length: Number(e.target.value) }))}
                  className="h-9" placeholder="0 = auto" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Tensor Parallel</label>
                <Input type="number" value={deployConfig.tensor_parallel_size} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeployConfig(p => ({ ...p, tensor_parallel_size: Number(e.target.value) }))}
                  className="h-9" min={1} max={8} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Host</label>
                <Input value={deployConfig.host} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeployConfig(p => ({ ...p, host: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Port</label>
                <Input type="number" value={deployConfig.port} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeployConfig(p => ({ ...p, port: Number(e.target.value) }))} className="h-9" />
              </div>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Auto-detected Features</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={deployConfig.enable_multimodal} onChange={e => setDeployConfig(p => ({ ...p, enable_multimodal: e.target.checked }))} className="rounded border-border" />
                  <span className="text-xs text-text">Multimodal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={deployConfig.trust_remote_code} onChange={e => setDeployConfig(p => ({ ...p, trust_remote_code: e.target.checked }))} className="rounded border-border" />
                  <span className="text-xs text-text">Trust Remote Code</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-muted">Tool Call Parser</label>
                  <select value={deployConfig.tool_call_parser} onChange={e => setDeployConfig(p => ({ ...p, tool_call_parser: e.target.value }))}
                    className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text">
                    <option value="">None</option>
                    {['llama3', 'qwen', 'mistral', 'deepseekv3', 'glm'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-muted">Reasoning Parser</label>
                  <select value={deployConfig.reasoning_parser} onChange={e => setDeployConfig(p => ({ ...p, reasoning_parser: e.target.value }))}
                    className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text">
                    <option value="">None</option>
                    {['deepseek-r1', 'qwen3'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-muted">Load Format</label>
                <select value={deployConfig.load_format} onChange={e => setDeployConfig(p => ({ ...p, load_format: e.target.value }))}
                  className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text">
                  <option value="">Auto (SafeTensors)</option>
                  <option value="safetensors">SafeTensors</option>
                  <option value="gguf">GGUF</option>
                </select>
              </div>
            </div>
            {deployMsg && (
              <div className={cn("text-sm py-2 px-3 rounded-lg", deployMsg.includes('Failed') ? "bg-danger/10 text-danger" : "bg-success/10 text-success")}>
                {deployMsg}
              </div>
            )}
            <Button onClick={handleDeploy} disabled={deploying} className="w-full gap-2">
              {deploying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {deploying ? 'Deploying...' : 'Start Server'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const LocateDialog = () => {
    if (!showLocateDialog || !locateResult) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowLocateDialog(false)}>
        <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-text">Model Location</h3>
            <button onClick={() => setShowLocateDialog(false)} className="text-text-muted hover:text-text"><X size={20} /></button>
          </div>
          <div className="space-y-3">
            <div className="bg-surface-2 rounded-lg p-3 border border-border">
              <p className="text-xs text-text-muted mb-1">Path</p>
              <p className="text-sm font-mono text-text break-all">{locateResult.local_path}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-2 rounded-lg p-3 border border-border text-center">
                <p className="text-lg font-bold text-text">{locateResult.size_gb}</p>
                <p className="text-xs text-text-muted">GB</p>
              </div>
              <div className="bg-surface-2 rounded-lg p-3 border border-border text-center">
                <p className="text-lg font-bold text-text">{locateResult.format}</p>
                <p className="text-xs text-text-muted">Format</p>
              </div>
              <div className="bg-surface-2 rounded-lg p-3 border border-border text-center">
                <p className="text-lg font-bold text-text">{locateResult.files.length}</p>
                <p className="text-xs text-text-muted">Files</p>
              </div>
            </div>
            <div className="bg-surface-2 rounded-lg p-3 border border-border max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-text-muted mb-2">Files</p>
              {locateResult.files.map((f, i) => (
                <p key={i} className="text-xs font-mono text-text-muted py-0.5">{f}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const DeleteDialog = () => {
    if (!showDeleteDialog || !deleteTarget) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteDialog(false)}>
        <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center"><Trash2 className="h-5 w-5 text-danger" /></div>
            <div>
              <h3 className="text-lg font-bold text-text">Delete Model</h3>
              <p className="text-sm text-text-muted">{deleteTarget.repo_id}</p>
            </div>
          </div>
          <p className="text-sm text-text-muted mb-4">
            This will permanently delete <strong>{deleteTarget.size_gb} GB</strong> of model files from disk. This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="danger" onClick={handleDelete} disabled={deleting} className="flex-1 gap-2">
              {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
            <Button variant="secondary" onClick={() => setShowDeleteDialog(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </div>
    )
  }

  const ModelCard = ({ model, isLocal = false, localData }: { model: HFModel | { repo_id: string; model_name?: string }; isLocal?: boolean; localData?: LocalModel }) => {
    const repoId = model.repo_id
    const name = model.model_name || repoId.split('/').pop() || repoId
    const isHF = 'downloads' in model
    const m = isHF ? model as HFModel : undefined
    const l = localData

    return (
      <div className="border border-border rounded-xl bg-surface hover:border-border-hover hover:shadow-lg transition-all p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-text truncate">{name}</h4>
            <p className="text-xs text-text-muted truncate">{repoId}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {m && <FormatBadge format={m.format} />}
            {m && <QuantBadge quant={m.quantization} />}
            {m?.is_multimodal && <Badge variant="outline" className="text-[9px] py-0 border-camera text-camera">Vision</Badge>}
            {m?.is_moe && <Badge variant="outline" className="text-[9px] py-0 border-primary text-primary">MoE</Badge>}
            {l?.is_moe && <Badge variant="outline" className="text-[9px] py-0 border-primary text-primary">MoE</Badge>}
          </div>
        </div>

        {m?.description && <p className="text-xs text-text-muted line-clamp-2">{m.description}</p>}

        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          {isHF && m && <span className="flex items-center gap-1"><Download size={11} /> {fmtNum(m.downloads)}</span>}
          {isHF && m && <span className="flex items-center gap-1"><Heart size={11} /> {fmtNum(m.likes)}</span>}
          {m?.params_billions && <span className="flex items-center gap-1"><Cpu size={11} /> {m.params_billions}B</span>}
          {l?.params_billions && <span className="flex items-center gap-1"><Cpu size={11} /> {l.params_billions}B</span>}
          {(m?.vram_estimate_gb || l?.vram_estimate_gb) ? <span className="flex items-center gap-1"><HardDrive size={11} /> {m?.vram_estimate_gb || l?.vram_estimate_gb}GB</span> : null}
          {l && <span className="flex items-center gap-1"><Database size={11} /> {l.size_gb}GB</span>}
        </div>

        {(m || l) && <CompatibilityBadge fits={m?.fits_in_gpu ?? l?.fits_in_gpu} vram={m?.vram_estimate_gb ?? l?.vram_estimate_gb} />}

        {l?.warnings && l.warnings.length > 0 && (
          <div className="text-[10px] text-warning bg-warning/10 rounded px-2 py-1">{l.warnings[0]}</div>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => isLocal && l ? openDeployDialogFromLocal(l) : openDeployDialog(m || { repo_id: repoId, model_name: name, author: repoId.split('/')[0], downloads: 0, likes: 0, tags: [] } as HFModel)}
            className="flex-1 gap-1 text-xs h-8">
            <Play size={12} /> Launch
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleLocate(repoId)} className="gap-1 text-xs h-8">
            <FolderOpen size={12} />
          </Button>
          {isLocal && l ? (
            <Button size="sm" variant="danger" onClick={() => { setDeleteTarget(l); setShowDeleteDialog(true) }} className="gap-1 text-xs h-8">
              <Trash2 size={12} />
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => handleDownload(repoId)} disabled={downloading === repoId} className="gap-1 text-xs h-8">
              {downloading === repoId ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
            </Button>
          )}
        </div>
      </div>
    )
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Model Hub</h1>
          <p className="text-sm text-text-muted mt-1">Search, filter, and deploy models from HuggingFace</p>
        </div>
        <div className="flex items-center gap-3">
          {gpuInfo && (
            <div className="text-xs text-text-muted bg-surface-2 px-3 py-1.5 rounded-lg border border-border">
              <HardDrive size={12} className="inline mr-1" />
              {gpuInfo.name} — {gpuInfo.free_gb}GB free / {gpuInfo.total_gb}GB
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={handleRefresh} className="gap-1"><RefreshCw size={14} /> Refresh</Button>
        </div>
      </div>

      <div className="flex gap-1 bg-surface-2 p-1 rounded-lg border border-border w-fit">
        {(['quick', 'trending', 'hub', 'local'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors",
              tab === t ? "bg-primary text-white shadow" : "text-text-muted hover:text-text")}>
            {t === 'quick' ? 'Quick Deploy' : t === 'trending' ? 'Trending' : t === 'hub' ? 'HuggingFace' : `Local (${local.length})`}
          </button>
        ))}
      </div>

      {(tab === 'hub' || tab === 'trending') && (
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Input icon={<Search className="h-4 w-4" />} value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSearch()}
              placeholder={tab === 'trending' ? 'Search trending models...' : 'Search HuggingFace models...'}
              className="h-10" />
          </div>
          <Button onClick={handleSearch} disabled={searching} className="gap-2">
            {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)} className="gap-2 relative">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>
            )}
          </Button>
        </div>
      )}

      {tab === 'trending' && !query && (
        <div className="flex flex-wrap gap-2">
          {TRENDING_SEARCHES.map(tag => (
            <button key={tag} onClick={() => { setQuery(tag); setTimeout(handleSearch, 100) }}
              className="px-3 py-1.5 rounded-full bg-surface-2 border border-border text-xs text-text-muted hover:text-primary hover:border-primary transition-colors">
              <TrendingUp size={12} className="inline mr-1" />{tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-6">
        {(showFilters && (tab === 'hub' || tab === 'trending')) && (
          <div className="w-56 shrink-0">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1"><SlidersHorizontal size={12} /> Filters</span>
                  {activeFilterCount > 0 && (
                    <button onClick={clearFilters} className="text-[10px] text-primary hover:underline">Clear all</button>
                  )}
                </div>
                <FilterSidebar />
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {tab === 'quick' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {QUICK_MODELS.map(m => {
                const hf: HFModel = { repo_id: m.repo_id, model_name: m.label, author: m.repo_id.split('/')[0], downloads: 0, likes: 0, tags: [], description: m.desc, vram_estimate_gb: m.vram, fits_in_gpu: m.vram <= (gpuInfo?.total_gb || 0) }
                return <ModelCard key={m.repo_id} model={hf} />
              })}
            </div>
          )}

          {(tab === 'hub' || tab === 'trending') && (
            <>
              {searching ? (
                <div className="flex items-center justify-center py-20 text-text-muted"><RefreshCw className="h-6 w-6 animate-spin mr-2" /> Searching...</div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                  <Inbox className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">{tab === 'hub' ? 'Search for models on HuggingFace' : 'Click a trending tag or search'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.map(m => <ModelCard key={m.repo_id} model={m} />)}
                </div>
              )}
            </>
          )}

          {tab === 'local' && (
            <>
              {local.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                  <Inbox className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No local models found</p>
                  <p className="text-xs mt-1">Download models from HuggingFace or place them in ~/models</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {local.map(m => <ModelCard key={m.repo_id} model={{ repo_id: m.repo_id, model_name: m.model_name }} isLocal localData={m} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <DeployDialog />
      <LocateDialog />
      <DeleteDialog />
    </div>
  )
}
