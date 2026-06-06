import { useState, useEffect, useRef } from 'react'
import { startServer, stopServer, restartServer, getServerStatus, getServerLogs, listServerProfiles, getActiveProfile, scanLocalModels, getGPULiveStatus, validateModel } from '../api/endpoints'
import type { ServerProfile, LocalModel, GPULiveStatus, GPULiveInfo, ModelValidation } from '../types'
import { Cpu, Play, Square, RotateCw, Settings, FileText, Search, Shield, MonitorSpeaker, ChevronDown, ChevronUp, Gauge, Zap, Server, MemoryStick, AlertTriangle, HardDrive, RefreshCw, Thermometer, Power, Activity, CheckCircle2, XCircle, Info, Link as LinkIcon, Layers } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/Button'

const QUANT_OPTIONS = [
  { value: '', label: 'None', desc: 'Full precision (fp16/bf16)' },
  { value: 'awq', label: 'AWQ 4-bit', desc: 'Best quality/size' },
  { value: 'fp8', label: 'FP8', desc: 'Hopper GPUs' },
  { value: 'gptq', label: 'GPTQ 4-bit', desc: 'Fast inference' },
  { value: 'bitsandbytes', label: 'BnB 4-bit', desc: 'Universal fallback' },
]

const DTYPE_OPTIONS = ['auto', 'half', 'bfloat16', 'float32']

const SCHEDULE_POLICIES = [
  { value: 'lpm', label: 'LPM', desc: 'Longest prefix match' },
  { value: 'fcfs', label: 'FCFS', desc: 'First come first serve' },
  { value: 'dfs-override', label: 'DFS', desc: 'Depth-first override' },
  { value: 'random', label: 'Random', desc: 'Random selection' },
]

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

function Toggle({ value, onChange, label, icon: Icon }: {
  value: boolean; onChange: (v: boolean) => void; label: string; icon?: any
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group py-2">
      <div className={cn("w-10 h-5 rounded-full transition-colors relative", value ? "bg-primary" : "bg-surface-2 border border-border")}
        onClick={() => onChange(!value)}>
        <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm", value ? "translate-x-5" : "translate-x-0.5")} />
      </div>
      <span className="text-sm font-medium text-text group-hover:text-primary transition-colors flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4" />} {label}
      </span>
    </label>
  )
}

function SliderField({ label, value, onChange, min, max, step = 1, unit = '', format, description }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; format?: (v: number) => string; description?: string
}) {
  const display = format ? format(value) : value.toString()
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-muted">{label}</label>
        <span className="text-xs font-mono font-semibold bg-surface-2 px-2 py-0.5 rounded border border-border">
          {display}{unit}
        </span>
      </div>
      {description && <p className="text-[10px] text-text-muted">{description}</p>}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-full h-1.5 bg-surface-2 rounded-full appearance-none cursor-pointer accent-primary" />
    </div>
  )
}

function OptionButtons({ label, options, value, onChange }: {
  label: string; options: Array<{ value: string; label: string; desc?: string }>; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={cn(
              "px-3 py-2 rounded-lg text-xs font-medium transition-all border text-left",
              value === o.value ? "bg-primary text-white border-primary shadow-sm" : "bg-surface-2 text-text border-border hover:bg-border-hover hover:border-border-hover"
            )}>
            <div>{o.label}</div>
            {o.desc && <div className="text-[10px] opacity-70 mt-0.5">{o.desc}</div>}
          </button>
        ))}
      </div>
    </div>
  )
}

function TextInput({ label, value, onChange, placeholder, description }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; description?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {description && <p className="text-[10px] text-text-muted">{description}</p>}
      <Input value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={placeholder} className="h-9 font-mono text-xs" />
    </div>
  )
}

function ValidationBanner({ validation }: { validation: ModelValidation | null }) {
  if (!validation) return null

  return (
    <div className="space-y-2">
      {validation.errors.map((err, i) => (
        <div key={`e-${i}`} className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <pre className="whitespace-pre-wrap font-mono">{err}</pre>
        </div>
      ))}
      {validation.warnings.map((warn, i) => (
        <div key={`w-${i}`} className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{warn}</span>
        </div>
      ))}
      {validation.suggestions.map((sug, i) => (
        <div key={`s-${i}`} className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/30 text-info text-xs">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{sug}</span>
        </div>
      ))}
    </div>
  )
}

function GPUStatusBar({ gpu }: { gpu: GPULiveInfo }) {
  const memPct = gpu.utilization_pct
  const gpuPct = gpu.gpu_util_pct
  const tempColor = gpu.temperature_c > 80 ? 'text-danger' : gpu.temperature_c > 65 ? 'text-warning' : 'text-success'
  const memColor = memPct > 90 ? 'bg-danger' : memPct > 70 ? 'bg-warning' : 'bg-primary'

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{gpu.name}</span>
            <Badge variant="outline" className="text-[10px] py-0">GPU {gpu.index}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className={cn("flex items-center gap-1", tempColor)}>
              <Thermometer className="h-3 w-3" /> {gpu.temperature_c}°C
            </span>
            <span className="flex items-center gap-1 text-text-muted">
              <Power className="h-3 w-3" /> {gpu.power_w}W / {gpu.power_limit_w}W
            </span>
          </div>
        </div>

        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">VRAM</span>
            <span className="font-mono">{(gpu.used_mb / 1024).toFixed(1)} / {(gpu.total_mb / 1024).toFixed(1)} GB ({memPct.toFixed(0)}%)</span>
          </div>
          <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-500", memColor)}
              style={{ width: `${Math.min(memPct, 100)}%` }} />
          </div>
        </div>

        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">GPU Utilization</span>
            <span className="font-mono">{gpuPct}%</span>
          </div>
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-info rounded-full transition-all duration-500"
              style={{ width: `${Math.min(gpuPct, 100)}%` }} />
          </div>
        </div>

        {gpu.processes.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
              <Activity className="h-3 w-3" /> Processes ({gpu.processes.length})
            </div>
            <div className="space-y-1">
              {gpu.processes.map((proc, i) => (
                <div key={i} className="flex items-center justify-between bg-surface-2/50 rounded px-2 py-1 text-xs">
                  <span className="text-text truncate max-w-[200px]" title={proc.name}>{proc.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted font-mono">PID {proc.pid}</span>
                    <span className="font-mono font-semibold text-warning">{proc.used_mb > 0 ? `${(proc.used_mb / 1024).toFixed(1)} GB` : '?'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {gpu.processes.length === 0 && (
          <div className="mt-2 text-xs text-text-muted italic">No processes using GPU</div>
        )}
      </CardContent>
    </Card>
  )
}

function LocalModelCard({ model, isSelected, onSelect }: { model: LocalModel; isSelected: boolean; onSelect: () => void }) {
  const fits = model.fits_in_gpu
  const hasWarnings = model.warnings && model.warnings.length > 0
  const isCompatible = model.compatible !== false

  return (
    <button onClick={onSelect}
      className={cn(
        "flex flex-col items-start p-3 rounded-lg border transition-all text-left w-full",
        isSelected ? "border-primary bg-primary/10 ring-1 ring-primary/50" : "border-border bg-surface hover:border-border-hover hover:bg-surface-2"
      )}>
      <div className="flex items-center gap-2 mb-1 w-full">
        <HardDrive className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-text-muted")} />
        <span className="text-sm font-semibold text-text truncate">{model.model_name}</span>
        {!isCompatible && <XCircle className="h-3.5 w-3.5 text-danger shrink-0" />}
        {isCompatible && !fits && <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />}
        {isCompatible && fits && <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />}
      </div>
      <p className="text-[10px] text-text-muted truncate w-full font-mono">{model.repo_id}</p>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap w-full">
        <Badge variant={fits ? "outline" : "danger"} className="text-[10px] py-0">
          {model.size_gb}GB
        </Badge>
        {model.vram_estimate_gb > 0 && (
          <Badge variant={fits ? "outline" : "danger"} className="text-[10px] py-0">
            ~{model.vram_estimate_gb}GB VRAM
          </Badge>
        )}
        {model.quantization && model.quantization !== 'fp16' && (
          <Badge variant="outline" className="text-[10px] py-0 uppercase">{model.quantization}</Badge>
        )}
        {model.params_billions && (
          <Badge variant="outline" className="text-[10px] py-0">{model.params_billions}B</Badge>
        )}
        {model.is_moe && (
          <Badge variant="outline" className="text-[10px] py-0">MoE</Badge>
        )}
        {model.context_length > 0 && (
          <Badge variant="outline" className="text-[10px] py-0">{model.context_length >= 1024 ? `${(model.context_length / 1024).toFixed(0)}K` : model.context_length}</Badge>
        )}
      </div>
      {hasWarnings && isSelected && (
        <div className="mt-2 w-full">
          {model.warnings!.map((w, i) => (
            <div key={i} className="text-[10px] text-warning bg-warning/10 rounded px-2 py-1 mt-1">{w}</div>
          ))}
        </div>
      )}
    </button>
  )
}

function VRAMEstimate({ model, advanced, gpu }: { model: LocalModel | null; advanced: AdvancedConfig; gpu: GPULiveInfo | null }) {
  if (!model || !gpu) return null
  const modelVram = model.vram_estimate_gb
  const totalVram = gpu.total_mb / 1024
  const kvCache = totalVram * advanced.mem_fraction_static
  const freeAfterModel = gpu.free_mb / 1024 - modelVram
  const fits = modelVram <= (gpu.free_mb / 1024)

  return (
    <Card className={cn("border", fits ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <MemoryStick className="h-4 w-4" />
          <span className="text-sm font-semibold">VRAM Analysis</span>
          <Badge variant={fits ? "success" : "danger"} className="text-[10px] py-0">
            {fits ? "FITS" : "DOESN'T FIT"}
          </Badge>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="bg-surface-2/50 rounded-lg p-2">
            <p className="text-lg font-bold text-text">{modelVram.toFixed(1)} GB</p>
            <p className="text-[10px] text-text-muted">Model</p>
          </div>
          <div className="bg-surface-2/50 rounded-lg p-2">
            <p className={cn("text-lg font-bold", advanced.mem_fraction_static > 0.9 ? "text-warning" : "text-text")}>{kvCache.toFixed(1)} GB</p>
            <p className="text-[10px] text-text-muted">KV Cache ({(advanced.mem_fraction_static * 100).toFixed(0)}%)</p>
          </div>
          <div className="bg-surface-2/50 rounded-lg p-2">
            <p className={cn("text-lg font-bold", freeAfterModel < 0 ? "text-danger" : "text-success")}>{freeAfterModel > 0 ? freeAfterModel.toFixed(1) : '0'} GB</p>
            <p className="text-[10px] text-text-muted">Available Free</p>
          </div>
          <div className="bg-surface-2/50 rounded-lg p-2">
            <p className="text-lg font-bold text-text">{(gpu.used_mb / 1024).toFixed(1)} GB</p>
            <p className="text-[10px] text-text-muted">Currently Used</p>
          </div>
        </div>
        {!fits && (
          <div className="flex items-start gap-2 mt-3 text-xs text-danger">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Need ~{modelVram.toFixed(1)}GB free. Currently {(gpu.free_mb / 1024).toFixed(1)}GB free. {gpu.processes.length > 0 ? `Kill GPU processes or use a smaller/quantized model.` : `Try quantization (AWQ/BnB) or a smaller model.`}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ServerPage() {
  const [config, setConfig] = useState({
    model_path: '', host: '127.0.0.1', port: 30000, tensor_parallel_size: 1,
    quantization: '', dtype: 'auto', context_length: 0, enable_multimodal: false, trust_remote_code: false,
    extra_args: {} as Record<string, unknown>,
  })
  const [advanced, setAdvanced] = useState<AdvancedConfig>({
    mem_fraction_static: 0.88,
    chunked_prefill_size: 8192,
    cuda_graph_max_bs: 128,
    enable_metrics: true,
    reasoning_parser: '',
    tool_call_parser: '',
    schedule_policy: 'lpm',
    max_running_requests: 0,
    max_prefill_tokens: 0,
    disable_mixed_chunk: false,
    enable_dp_attention: false,
    disable_overlap_schedule: false,
    nccl_num_groups: 1,
    dist_init_addr: '',
    chat_template: '',
    grammar_backend: '',
    load_format: '',
    is_embedding: false,
    log_level: '',
    kv_cache_dtype: '',
    cpu_offload_gb: 0,
    disable_cuda_graph: false,
    ep_size: 1,
    moe_runner_backend: '',
    speculative_algorithm: '',
    speculative_num_steps: 3,
    speculative_draft_model_path: '',
    pp_size: 1,
  })
  const [status, setStatus] = useState({ running: false, health: 'stopped', pid: null as number | null, model_path: '', uptime_seconds: null as number | null })
  const [logs, setLogs] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(false)
  const [profiles, setProfiles] = useState<ServerProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<ServerProfile | null>(null)
  const [tab, setTab] = useState<'config' | 'logs' | 'gpu'>('config')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedModel, setSelectedModel] = useState<LocalModel | null>(null)
  const [validation, setValidation] = useState<ModelValidation | null>(null)
  const [localModels, setLocalModels] = useState<LocalModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [scannedDirs, setScannedDirs] = useState<string[]>([])

  const [gpuStatus, setGpuStatus] = useState<GPULiveStatus | null>(null)
  const [gpuLoading] = useState(false)

  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchStatus(); fetchProfiles(); scanModels(); fetchGPU() }, [])
  useEffect(() => { const i = setInterval(() => { fetchStatus(); fetchLogs(); fetchGPU() }, 3000); return () => clearInterval(i) }, [cursor])
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  // Auto-validate when config changes
  useEffect(() => {
    if (config.model_path) {
      const t = setTimeout(() => runValidation(), 500)
      return () => clearTimeout(t)
    } else {
      setValidation(null)
    }
  }, [config.model_path, config.quantization, config.dtype])

  const fetchStatus = async () => {
    try { const s = await getServerStatus(); setStatus({ running: s.data.running, health: s.data.health || 'stopped', pid: s.data.pid || null, model_path: s.data.model_path || '', uptime_seconds: s.data.uptime_seconds || null }) } catch {}
  }
  const fetchLogs = async () => {
    try { const r = await getServerLogs(cursor); if (r.data.lines?.length) { setLogs(p => [...p, ...r.data.lines]); setCursor(r.data.cursor) } } catch {}
  }
  const fetchProfiles = async () => {
    try { const [p, a] = await Promise.all([listServerProfiles(), getActiveProfile()]); setProfiles(p.data); setActiveProfile(a.data) } catch {}
  }

  const scanModels = async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const r = await scanLocalModels()
      setLocalModels(r.data.models || [])
      setScannedDirs(r.data.scanned_dirs || [])
    } catch (e: any) {
      setModelsError(e.message || 'Failed to scan models')
    } finally {
      setModelsLoading(false)
    }
  }

  const fetchGPU = async () => {
    try { const r = await getGPULiveStatus(); setGpuStatus(r.data) } catch {}
  }

  const runValidation = async () => {
    if (!config.model_path) return
    try {
      const r = await validateModel(config)
      setValidation(r.data)
    } catch (e: any) {
      if (e.response?.data?.detail) {
        const detail = e.response.data.detail
        setValidation({
          valid: false,
          errors: detail.errors || [detail.message || 'Validation failed'],
          warnings: detail.warnings || [],
          suggestions: detail.suggestions || [],
          model_info: detail.model_info,
        })
      } else {
        setValidation({ valid: false, errors: [e.message || 'Validation failed'], warnings: [], suggestions: [] })
      }
    }
  }

  const loadProfile = (profile: ServerProfile) => {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(profile.args_json || '{}') } catch {}
    setConfig({
      model_path: profile.model_path, host: profile.host, port: profile.port,
      tensor_parallel_size: (args.tensor_parallel_size as number) || 1,
      quantization: (args.quantization as string) || '',
      dtype: (args.dtype as string) || 'auto',
      context_length: (args.context_length as number) || 0,
      enable_multimodal: (args.enable_multimodal as boolean) || false,
      trust_remote_code: (args.trust_remote_code as boolean) || false,
      extra_args: args.extra_args as Record<string, unknown> || {},
    })
    setSelectedModel(null)
    setValidation(null)
  }

  const selectLocalModel = (model: LocalModel) => {
    setSelectedModel(model)
    // Auto-configure everything from the model
    const quant = model.recommended_quant || model.quantization || ''
    setConfig(p => ({
      ...p,
      model_path: model.repo_id,
      quantization: quant,
      context_length: model.context_length || 0,
      dtype: quant && quant !== 'fp16' && quant !== '' ? 'auto' : 'auto',
      trust_remote_code: true,
      enable_multimodal: model.is_moe ? false : (model.architectures?.some(a => a.toLowerCase().includes('vision') || a.toLowerCase().includes('conditional')) || false),
    }))
    setTab('config')
  }

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

  const handleStart = async () => {
    setLoading(true)
    try {
      await startServer({
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
      })
    } catch (e: any) {
      if (e.response?.data?.detail) {
        const detail = e.response.data.detail
        setValidation({
          valid: false,
          errors: detail.errors || [detail.message || 'Start failed'],
          warnings: detail.warnings || [],
          suggestions: detail.suggestions || [],
          model_info: detail.model_info,
        })
        setTab('config')
      }
    } finally {
      setLoading(false)
    }
  }
  const handleStop = async () => { try { await stopServer() } catch {} }
  const handleRestart = async () => { try { await restartServer() } catch {} }

  const uptime = status.uptime_seconds ? `${Math.floor(status.uptime_seconds / 60)}m ${Math.floor(status.uptime_seconds % 60)}s` : '--'
  const update = (f: string, v: unknown) => setConfig(p => ({ ...p, [f]: v }))
  const updateA = (f: keyof AdvancedConfig, v: unknown) => setAdvanced(p => ({ ...p, [f]: v as any }))

  const primaryGpu = gpuStatus?.gpus?.[0] || null
  const canDeploy = config.model_path && !status.running && !loading

  return (
    <div className="p-8 space-y-6 animate-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">Server Control</h1>
          <p className="text-text-muted mt-1">Configure and launch your SGLang server</p>
        </div>
        <div className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3 shadow-sm">
          <span className={cn("relative flex h-3 w-3", status.running ? "" : "opacity-50")}>
            {status.running && status.health === 'healthy' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>}
            <span className={cn("relative inline-flex rounded-full h-3 w-3", status.running ? (status.health === 'healthy' ? 'bg-success' : 'bg-warning') : 'bg-text-muted')}></span>
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">{status.running ? 'Running' : 'Stopped'}</p>
            {status.running && <p className="text-xs text-text-muted mt-1">{uptime} | {status.model_path.split('/').pop()}</p>}
          </div>
        </div>
      </div>

      {/* GPU Status Bar - always visible */}
      {primaryGpu && (
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">{primaryGpu.name}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted w-16">VRAM</span>
                  <div className="flex-1 h-2.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500",
                      primaryGpu.utilization_pct > 90 ? 'bg-danger' : primaryGpu.utilization_pct > 70 ? 'bg-warning' : 'bg-primary'
                    )} style={{ width: `${Math.min(primaryGpu.utilization_pct, 100)}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-text-muted w-32 text-right">
                    {(primaryGpu.used_mb / 1024).toFixed(1)} / {(primaryGpu.total_mb / 1024).toFixed(1)} GB
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className={cn("flex items-center gap-1", primaryGpu.temperature_c > 80 ? 'text-danger' : primaryGpu.temperature_c > 65 ? 'text-warning' : 'text-success')}>
                  <Thermometer className="h-3 w-3" /> {primaryGpu.temperature_c}°C
                </span>
                <span className="text-text-muted flex items-center gap-1">
                  <Activity className="h-3 w-3" /> {primaryGpu.gpu_util_pct}%
                </span>
                <span className="text-text-muted">{primaryGpu.power_w}W</span>
                {primaryGpu.processes.length > 0 && (
                  <Badge variant="warning" className="text-[10px] py-0">{primaryGpu.processes.length} proc</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant={tab === 'config' ? 'primary' : 'secondary'} onClick={() => setTab('config')}>
          <Settings className="w-4 h-4 mr-2" /> Configuration
        </Button>
        <Button variant={tab === 'gpu' ? 'primary' : 'secondary'} onClick={() => setTab('gpu')}>
          <Cpu className="w-4 h-4 mr-2" /> GPU Status
        </Button>
        <Button variant={tab === 'logs' ? 'primary' : 'secondary'} onClick={() => setTab('logs')}>
          <FileText className="w-4 h-4 mr-2" /> Logs
        </Button>
      </div>

      {tab === 'config' && (
        <div className="space-y-6">
          {/* Validation banner */}
          <ValidationBanner validation={validation} />

          {/* Local Models */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                <HardDrive className="h-4 w-4" /> Local Models
                {localModels.length > 0 && <Badge variant="outline" className="text-[10px] py-0">{localModels.length} found</Badge>}
              </CardTitle>
              <div className="flex items-center gap-2">
                {scannedDirs.length > 0 && (
                  <span className="text-[10px] text-text-muted">{scannedDirs.length} dirs</span>
                )}
                <button onClick={scanModels} disabled={modelsLoading}
                  className="text-xs text-primary hover:underline font-medium flex items-center gap-1 disabled:opacity-50">
                  <RefreshCw className={cn("h-3 w-3", modelsLoading && "animate-spin")} /> Scan
                </button>
                {selectedModel && (
                  <button onClick={() => { setSelectedModel(null); setConfig(p => ({ ...p, model_path: '' })); setValidation(null) }}
                    className="text-xs text-primary hover:underline font-medium">Clear</button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {modelsLoading && localModels.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Scanning for local models...</p>
                </div>
              )}
              {modelsError && (
                <div className="text-center py-6 text-danger text-sm">{modelsError}</div>
              )}
              {!modelsLoading && !modelsError && localModels.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  <HardDrive className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No local models found</p>
                  <p className="text-xs mt-1">Download models from the Models page or check ~/.cache/huggingface/hub</p>
                </div>
              )}
              {localModels.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {localModels.map(model => (
                    <LocalModelCard key={model.repo_id} model={model} isSelected={selectedModel?.repo_id === model.repo_id} onSelect={() => selectLocalModel(model)} />
                  ))}
                </div>
              )}
              <div className="mt-4 relative">
                <Input
                  icon={<Search className="h-4 w-4" />}
                  value={config.model_path}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setConfig(p => ({ ...p, model_path: e.target.value })); setSelectedModel(null) }}
                  placeholder="Or enter custom model path: repo/model-name or /absolute/path"
                  className="h-10 font-mono"
                />
              </div>
            </CardContent>
          </Card>

          {/* VRAM Analysis */}
          {selectedModel && <VRAMEstimate model={selectedModel} advanced={advanced} gpu={primaryGpu} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Server className="h-4 w-4" /> Server Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <TextInput label="Host" value={config.host} onChange={v => update('host', v)} placeholder="127.0.0.1" />
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">Port</label>
                    <Input type="number" value={config.port} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('port', Number(e.target.value))} className="h-9" />
                  </div>
                </div>
                <SliderField label="Tensor Parallel" value={config.tensor_parallel_size} min={1} max={8}
                  onChange={v => update('tensor_parallel_size', v)} description="Number of GPUs to shard the model across" />
                <OptionButtons label="Data Type" options={DTYPE_OPTIONS.map(d => ({ value: d, label: d }))} value={config.dtype} onChange={v => update('dtype', v)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> Model Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <OptionButtons label="Quantization" options={QUANT_OPTIONS} value={config.quantization} onChange={v => update('quantization', v)} />
                <OptionButtons label="Load Format" options={[
                  { value: '', label: 'Auto' }, { value: 'safetensors', label: 'SafeTensors' }, { value: 'gguf', label: 'GGUF' },
                ]} value={advanced.load_format} onChange={v => updateA('load_format', v)} />
                <SliderField label="Context Length" value={config.context_length} min={0} max={131072} step={1024}
                  onChange={v => update('context_length', v)}
                  format={v => v === 0 ? 'auto' : `${(v / 1024).toFixed(0)}K`}
                  description="0 = model default. Higher uses more VRAM for KV cache" />
                <div className="flex gap-6 pt-2">
                  <Toggle value={config.enable_multimodal} onChange={v => update('enable_multimodal', v)} label="Multimodal" icon={MonitorSpeaker} />
                  <Toggle value={config.trust_remote_code} onChange={v => update('trust_remote_code', v)} label="Trust Code" icon={Shield} />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setShowAdvanced(!showAdvanced)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Advanced Settings
                  <Badge variant="outline" className="text-[10px] py-0 ml-2">
                    {Object.entries(advanced).filter(([k, v]) => {
                      if (k === 'mem_fraction_static' && v !== 0.88) return true
                      if (k === 'chunked_prefill_size' && v !== 8192) return true
                      if (k === 'cuda_graph_max_bs' && v !== 128) return true
                      if (k === 'enable_metrics' && v !== true) return true
                      if (k === 'schedule_policy' && v !== 'lpm') return true
                      return false
                    }).length > 0 ? 'custom' : 'defaults'}
                  </Badge>
                </CardTitle>
                {showAdvanced ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
              </div>
            </CardHeader>
            {showAdvanced && (
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-5">
                    <div className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-border">
                      <MemoryStick className="h-3.5 w-3.5" /> Memory & Performance
                    </div>
                    <SliderField label="KV Cache Fraction" value={advanced.mem_fraction_static}
                      min={0.5} max={0.99} step={0.01}
                      onChange={v => updateA('mem_fraction_static', v)}
                      format={v => `${(v * 100).toFixed(0)}%`}
                      description="GPU memory for KV cache. Higher = more concurrent requests. Keep below 0.95 for stability" />
                    <SliderField label="Chunked Prefill Size" value={advanced.chunked_prefill_size}
                      min={512} max={32768} step={512}
                      onChange={v => updateA('chunked_prefill_size', v)}
                      format={v => v >= 1024 ? `${(v / 1024).toFixed(1)}K` : v.toString()}
                      description="Max tokens per prefill chunk. Higher = faster but more VRAM" />
                    <SliderField label="CUDA Graph Max Batch" value={advanced.cuda_graph_max_bs}
                      min={32} max={1024} step={32}
                      onChange={v => updateA('cuda_graph_max_bs', v)}
                      description="Max batch size for CUDA graph. Higher = more throughput but more VRAM" />
                    <SliderField label="Max Running Requests" value={advanced.max_running_requests}
                      min={0} max={256} step={1}
                      onChange={v => updateA('max_running_requests', v)}
                      format={v => v === 0 ? 'auto' : v.toString()}
                      description="0 = auto (depends on model and VRAM)" />
                    <SliderField label="Max Prefill Tokens" value={advanced.max_prefill_tokens}
                      min={0} max={131072} step={1024}
                      onChange={v => updateA('max_prefill_tokens', v)}
                      format={v => v === 0 ? 'auto' : v >= 1024 ? `${(v / 1024).toFixed(0)}K` : v.toString()}
                      description="0 = auto. Max tokens processed per prefill step" />
                  </div>
                  <div className="space-y-5">
                    <div className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-border">
                      <Settings className="h-3.5 w-3.5" /> Scheduling & Features
                    </div>
                    <OptionButtons label="Schedule Policy" options={SCHEDULE_POLICIES} value={advanced.schedule_policy} onChange={v => updateA('schedule_policy', v)} />
                    <TextInput label="Reasoning Parser" value={advanced.reasoning_parser} onChange={v => updateA('reasoning_parser', v)}
                      placeholder="e.g., deepseek-r1" description="Parser for thinking/reasoning models (e.g., deepseek-r1, qwen3)" />
                    <TextInput label="Tool Call Parser" value={advanced.tool_call_parser} onChange={v => updateA('tool_call_parser', v)}
                      placeholder="e.g., llama3" description="Parser for tool/function calling (llama3, qwen25, mistral, etc.)" />
                    <div className="space-y-3 pt-2">
                      <Toggle value={advanced.enable_metrics} onChange={v => updateA('enable_metrics', v)} label="Enable Metrics (Prometheus)" icon={Gauge} />
                      <Toggle value={advanced.disable_mixed_chunk} onChange={v => updateA('disable_mixed_chunk', v)} label="Disable Mixed Chunk" icon={AlertTriangle} />
                      <Toggle value={advanced.enable_dp_attention} onChange={v => updateA('enable_dp_attention', v)} label="DP Attention" icon={Zap} />
                      <Toggle value={advanced.disable_overlap_schedule} onChange={v => updateA('disable_overlap_schedule', v)} label="Disable Overlap Schedule" icon={AlertTriangle} />
                    </div>
                    <SliderField label="NCCL Num Groups" value={advanced.nccl_num_groups}
                      min={1} max={8} step={1}
                      onChange={v => updateA('nccl_num_groups', v)}
                      description="Number of NCCL groups for tensor parallelism" />
                    <TextInput label="Dist Init Addr" value={advanced.dist_init_addr} onChange={v => updateA('dist_init_addr', v)}
                      placeholder="auto" description="Distributed initialization address (for multi-node)" />
                    <TextInput label="Chat Template" value={advanced.chat_template} onChange={v => updateA('chat_template', v)}
                      placeholder="auto" description="Custom chat template path or name" />
                    <OptionButtons label="Grammar Backend" options={[
                      { value: '', label: 'Auto' }, { value: 'xgrammar', label: 'XGrammar' },
                      { value: 'outlines', label: 'Outlines' }, { value: 'llguidance', label: 'Llguidance' },
                    ]} value={advanced.grammar_backend} onChange={v => updateA('grammar_backend', v)} />
                    <OptionButtons label="Log Level" options={[
                      { value: '', label: 'Default' }, { value: 'debug', label: 'Debug' },
                      { value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' },
                      { value: 'error', label: 'Error' },
                    ]} value={advanced.log_level} onChange={v => updateA('log_level', v)} />
                    <div className="space-y-3 pt-2">
                      <Toggle value={advanced.is_embedding} onChange={v => updateA('is_embedding', v)} label="Embedding Model" icon={LinkIcon} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-border">
                  <div className="space-y-5">
                    <div className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-border">
                      <HardDrive className="h-3.5 w-3.5" /> Memory & Offloading
                    </div>
                    <OptionButtons label="KV Cache Dtype" options={[
                      { value: '', label: 'Auto (BF16)' }, { value: 'fp8_e4m3', label: 'FP8 E4M3 (2x ctx)' },
                      { value: 'fp8_e5m2', label: 'FP8 E5M2' }, { value: 'bf16', label: 'BF16' },
                    ]} value={advanced.kv_cache_dtype} onChange={v => updateA('kv_cache_dtype', v)} />
                    <SliderField label="CPU Offload" value={advanced.cpu_offload_gb}
                      min={0} max={50} step={1}
                      onChange={v => updateA('cpu_offload_gb', v)}
                      format={v => v === 0 ? 'Disabled' : `${v} GB`}
                      description="Offload model weights to CPU RAM. Use when GPU VRAM is insufficient" />
                    <SliderField label="Memory Fraction" value={advanced.mem_fraction_static}
                      min={0.5} max={0.99} step={0.01}
                      onChange={v => updateA('mem_fraction_static', v)}
                      format={v => `${(v * 100).toFixed(0)}%`}
                      description="GPU memory for model+KV. Lower if OOM (default: 88%)" />
                    <SliderField label="Max Running Requests" value={advanced.max_running_requests}
                      min={0} max={256} step={1}
                      onChange={v => updateA('max_running_requests', v)}
                      format={v => v === 0 ? 'auto' : v.toString()}
                      description="Limit concurrent requests to cap memory usage" />
                    <div className="space-y-3 pt-2">
                      <Toggle value={advanced.disable_cuda_graph} onChange={v => updateA('disable_cuda_graph', v)} label="Disable CUDA Graph" icon={AlertTriangle} />
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-border">
                      <Layers className="h-3.5 w-3.5" /> MoE & Expert Parallelism
                    </div>
                    <SliderField label="Expert Parallelism (EP)" value={advanced.ep_size}
                      min={1} max={8} step={1}
                      onChange={v => updateA('ep_size', v)}
                      format={v => v <= 1 ? 'Disabled' : `EP${v}`}
                      description="Distribute MoE experts across GPUs. Set to GPU count for large MoE models" />
                    <OptionButtons label="MoE Runner Backend" options={[
                      { value: '', label: 'Auto' }, { value: 'deep_gemm', label: 'Deep GEMM' },
                      { value: 'triton', label: 'Triton' }, { value: 'cutlass', label: 'CUTLASS' },
                    ]} value={advanced.moe_runner_backend} onChange={v => updateA('moe_runner_backend', v)} />
                    <div className="space-y-3 pt-2">
                      <Toggle value={advanced.enable_dp_attention} onChange={v => updateA('enable_dp_attention', v)} label="DP Attention (MoE)" icon={Zap} />
                    </div>
                    <div className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-border mt-4">
                      <Zap className="h-3.5 w-3.5" /> Speculative Decoding / MTP
                    </div>
                    <OptionButtons label="Algorithm" options={[
                      { value: '', label: 'Disabled' }, { value: 'EAGLE', label: 'EAGLE' },
                      { value: 'NGRAM', label: 'N-gram' }, { value: 'NEXTN', label: 'NextN' },
                    ]} value={advanced.speculative_algorithm} onChange={v => updateA('speculative_algorithm', v)} />
                    {advanced.speculative_algorithm && (
                      <>
                        <SliderField label="Speculative Steps" value={advanced.speculative_num_steps}
                          min={1} max={10} step={1}
                          onChange={v => updateA('speculative_num_steps', v)}
                          description="Number of speculative steps. More = faster but more VRAM" />
                        <TextInput label="Draft Model Path" value={advanced.speculative_draft_model_path} onChange={v => updateA('speculative_draft_model_path', v)}
                          placeholder="auto (use model MTP heads)" description="External draft model for speculation (optional)" />
                      </>
                    )}
                    <div className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-border mt-4">
                      <Server className="h-3.5 w-3.5" /> Pipeline Parallelism
                    </div>
                    <SliderField label="Pipeline Parallel (PP)" value={advanced.pp_size}
                      min={1} max={4} step={1}
                      onChange={v => updateA('pp_size', v)}
                      format={v => v <= 1 ? 'Disabled' : `PP${v}`}
                      description="Split model layers across GPUs. Combine with TP for very large models" />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {profiles.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider">Saved Profiles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {profiles.map(p => (
                    <button key={p.id} onClick={() => loadProfile(p)}
                      className={cn(
                        "px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                        activeProfile?.id === p.id ? "bg-primary/10 border-primary text-primary" : "bg-surface-2 border-border text-text hover:bg-border-hover"
                      )}>
                      {p.name}
                      {p.is_remote && <Badge variant="outline" className="ml-2 text-[10px] py-0 border-info text-info">remote</Badge>}
                      {activeProfile?.id === p.id && <Badge variant="success" className="ml-2 text-[10px] py-0">active</Badge>}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deploy button - always visible at bottom */}
          <div className="flex gap-3 pt-2">
            <Button size="lg" onClick={handleStart} disabled={!canDeploy} className="gap-2">
              {loading ? <RotateCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {loading ? 'Starting...' : validation && !validation.valid ? 'Fix Errors First' : 'Deploy Server'}
            </Button>
            <Button size="lg" variant="danger" onClick={handleStop} disabled={!status.running} className="gap-2">
              <Square className="h-4 w-4" /> Stop
            </Button>
            <Button size="lg" variant="secondary" onClick={handleRestart} disabled={!status.running} className="gap-2">
              <RotateCw className="h-4 w-4" /> Restart
            </Button>
          </div>
        </div>
      )}

      {tab === 'gpu' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">GPU Status</h2>
            <Button variant="secondary" size="sm" onClick={fetchGPU} className="gap-1">
              <RefreshCw className={cn("h-3 w-3", gpuLoading && "animate-spin")} /> Refresh
            </Button>
          </div>
          {gpuStatus?.gpus?.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-text-muted">
                <Cpu className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No GPUs detected</p>
              </CardContent>
            </Card>
          )}
          {gpuStatus?.gpus?.map(gpu => (
            <GPUStatusBar key={gpu.index} gpu={gpu} />
          ))}
          {gpuStatus?.error && (
            <div className="text-xs text-danger mt-2">Error: {gpuStatus.error}</div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <Card className="overflow-hidden border-border bg-[#050510]">
          <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-text flex items-center gap-2"><FileText className="h-4 w-4" /> Server Logs</span>
            <Badge variant="outline">{logs.length} lines</Badge>
          </div>
          <div className="h-[500px] overflow-y-auto p-4 font-mono text-xs leading-relaxed text-green-400/80">
            {logs.map((line, i) => (
              <div key={i} className="hover:text-green-300 transition-colors whitespace-pre-wrap">{line}</div>
            ))}
            {!logs.length && <div className="text-text-muted italic py-12 text-center opacity-50">Waiting for server output...</div>}
            <div ref={logEndRef} />
          </div>
        </Card>
      )}
    </div>
  )
}
