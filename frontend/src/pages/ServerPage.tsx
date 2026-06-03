import { useState, useEffect, useRef, useMemo } from 'react'
import { startServer, stopServer, restartServer, getServerStatus, getServerLogs, listServerProfiles, getActiveProfile } from '../api/endpoints'
import type { ServerProfile } from '../types'
import { Cpu, Sparkles, Brain, FlaskConical, Waves, Play, Square, RotateCw, Settings, FileText, Search, Shield, MonitorSpeaker } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/Button'

const MODEL_PRESETS = [
  { id: 'llama3.1-8b', name: 'Llama 3.1 8B', path: 'meta-llama/Llama-3.1-8B-Instruct', icon: Cpu, desc: 'General purpose, fast', quant: '', ctx: 8192 },
  { id: 'llama3.1-70b', name: 'Llama 3.1 70B', path: 'meta-llama/Llama-3.1-70B-Instruct', icon: Cpu, desc: 'High quality, needs VRAM', quant: 'awq', ctx: 8192 },
  { id: 'qwen2.5-7b', name: 'Qwen 2.5 7B', path: 'Qwen/Qwen2.5-7B-Instruct', icon: Sparkles, desc: 'Multilingual, coding', quant: '', ctx: 32768 },
  { id: 'qwen2.5-72b', name: 'Qwen 2.5 72B', path: 'Qwen/Qwen2.5-72B-Instruct', icon: Sparkles, desc: 'Top-tier, needs 2+ GPUs', quant: 'awq', ctx: 32768 },
  { id: 'deepseek-v3', name: 'DeepSeek V3', path: 'deepseek-ai/DeepSeek-V3-0324', icon: Brain, desc: 'MoE, excellent reasoning', quant: 'fp8', ctx: 16384 },
  { id: 'phi-4', name: 'Phi-4 14B', path: 'microsoft/phi-4', icon: FlaskConical, desc: 'Compact, Microsoft research', quant: '', ctx: 16384 },
  { id: 'mistral-nemo', name: 'Mistral Nemo', path: 'mistralai/Mistral-Nemo-Instruct-2407', icon: Waves, desc: 'Fast 12B, multilingual', quant: '', ctx: 128000 },
  { id: 'gemma2-9b', name: 'Gemma 2 9B', path: 'google/gemma-2-9b-it', icon: Sparkles, desc: 'Google, efficient', quant: '', ctx: 8192 },
]

const QUANT_OPTIONS = [
  { value: '', label: 'None', desc: 'Full precision' },
  { value: 'awq', label: 'AWQ 4-bit', desc: 'Best quality/size' },
  { value: 'fp8', label: 'FP8', desc: 'Hopper GPUs' },
  { value: 'gptq', label: 'GPTQ 4-bit', desc: 'Fast inference' },
  { value: 'gguf', label: 'GGUF', desc: 'CPU/GPU hybrid' },
]

const DTYPE_OPTIONS = ['auto', 'half', 'bfloat16', 'float32']

export default function ServerPage() {
  const [config, setConfig] = useState({
    model_path: '', host: '127.0.0.1', port: 30000, tensor_parallel_size: 1,
    quantization: '', dtype: 'auto', context_length: 0, enable_multimodal: false, trust_remote_code: false,
    extra_args: {} as Record<string, unknown>,
  })
  const [status, setStatus] = useState({ running: false, health: 'stopped', pid: null as number | null, model_path: '', uptime_seconds: null as number | null })
  const [logs, setLogs] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(false)
  const [profiles, setProfiles] = useState<ServerProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<ServerProfile | null>(null)
  const [tab, setTab] = useState<'config' | 'logs'>('config')
  const [modelSearch, setModelSearch] = useState('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchStatus(); fetchProfiles() }, [])
  useEffect(() => { const i = setInterval(() => { fetchStatus(); fetchLogs() }, 3000); return () => clearInterval(i) }, [cursor])
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const fetchStatus = async () => {
    try { const s = await getServerStatus(); setStatus({ running: s.data.running, health: s.data.health || 'stopped', pid: s.data.pid || null, model_path: s.data.model_path || '', uptime_seconds: s.data.uptime_seconds || null }) } catch {}
  }
  const fetchLogs = async () => {
    try { const r = await getServerLogs(cursor); if (r.data.lines?.length) { setLogs(p => [...p, ...r.data.lines]); setCursor(r.data.cursor) } } catch {}
  }
  const fetchProfiles = async () => {
    try { const [p, a] = await Promise.all([listServerProfiles(), getActiveProfile()]); setProfiles(p.data); setActiveProfile(a.data) } catch {}
  }

  const filteredModels = useMemo(() => {
    if (!modelSearch) return MODEL_PRESETS
    const q = modelSearch.toLowerCase()
    return MODEL_PRESETS.filter(m => m.name.toLowerCase().includes(q) || m.path.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q))
  }, [modelSearch])

  const selectPreset = (preset: typeof MODEL_PRESETS[0]) => {
    setConfig(p => ({ ...p, model_path: preset.path, quantization: preset.quant, context_length: preset.ctx }))
    setSelectedPreset(preset.id)
    setModelSearch('')
    setShowModelDropdown(false)
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
    setSelectedPreset(null)
  }

  const handleStart = async () => { setLoading(true); try { await startServer(config) } catch (e) { console.error(e) } finally { setLoading(false) } }
  const handleStop = async () => { try { await stopServer() } catch {} }
  const handleRestart = async () => { try { await restartServer() } catch {} }

  const uptime = status.uptime_seconds ? `${Math.floor(status.uptime_seconds / 60)}m ${Math.floor(status.uptime_seconds % 60)}s` : '--'
  const update = (f: string, v: unknown) => setConfig(p => ({ ...p, [f]: v }))

  return (
    <div className="p-8 space-y-6 animate-in max-w-5xl mx-auto">
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

      <div className="flex gap-2">
        <Button variant={tab === 'config' ? 'primary' : 'secondary'} onClick={() => setTab('config')}>
          <Settings className="w-4 h-4 mr-2" /> Configuration
        </Button>
        <Button variant={tab === 'logs' ? 'primary' : 'secondary'} onClick={() => setTab('logs')}>
          <FileText className="w-4 h-4 mr-2" /> Logs
        </Button>
      </div>

      {tab === 'config' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider">Quick Select Model</CardTitle>
              {selectedPreset && (
                <button onClick={() => { setSelectedPreset(null); setConfig(p => ({ ...p, model_path: '' })) }}
                  className="text-xs text-primary hover:underline font-medium">
                  Clear selection
                </button>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MODEL_PRESETS.map(preset => {
                  const Icon = preset.icon
                  const isSelected = selectedPreset === preset.id
                  return (
                    <button key={preset.id} onClick={() => selectPreset(preset)}
                      className={cn(
                        "flex flex-col items-start p-3 rounded-lg border transition-all text-left",
                        isSelected 
                          ? "border-primary bg-primary/10 ring-1 ring-primary/50" 
                          : "border-border bg-surface hover:border-border-hover hover:bg-surface-2"
                      )}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-text-muted")} />
                        <span className="text-sm font-semibold text-text truncate">{preset.name}</span>
                      </div>
                      <p className="text-xs text-text-muted truncate w-full">{preset.desc}</p>
                      <p className="text-[10px] text-text-muted font-mono mt-1.5 truncate w-full opacity-60">{preset.path}</p>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider">Or Enter Model Path</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative" ref={modelInputRef}>
                <Input
                  icon={<Search className="h-4 w-4" />}
                  value={config.model_path}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setConfig(p => ({ ...p, model_path: e.target.value })); setSelectedPreset(null); setShowModelDropdown(true); setModelSearch(e.target.value) }}
                  onFocus={() => setShowModelDropdown(true)}
                  placeholder="e.g. meta-llama/Llama-3.1-8B-Instruct or /path/to/local/model"
                  className="h-11"
                />
                {showModelDropdown && filteredModels.length > 0 && (
                  <div className="absolute z-50 w-full mt-2 bg-surface-2 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {filteredModels.map(m => {
                      const Icon = m.icon
                      return (
                        <button key={m.id} onClick={() => selectPreset(m)}
                          className="w-full px-4 py-3 text-left hover:bg-border-hover transition-colors flex items-center gap-3 border-b border-border/50 last:border-0">
                          <Icon className="h-4 w-4 text-text-muted" />
                          <div>
                            <p className="text-sm font-medium text-text">{m.name}</p>
                            <p className="text-xs text-text-muted">{m.desc}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider">Server Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1.5 block">Host</label>
                  <Input value={config.host} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('host', e.target.value)} placeholder="127.0.0.1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1.5 block">Port</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={1024} max={65535} value={config.port} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('port', Number(e.target.value))}
                      className="flex-1" />
                    <Input type="number" value={config.port} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('port', Number(e.target.value))} className="w-24 text-center" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1.5 block">Tensor Parallel</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={1} max={8} value={config.tensor_parallel_size} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('tensor_parallel_size', Number(e.target.value))}
                      className="flex-1" />
                    <span className="text-sm font-mono font-medium bg-surface-2 px-3 py-1.5 rounded-md border border-border w-12 text-center">{config.tensor_parallel_size}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-text-muted uppercase tracking-wider">Model Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1.5 block">Quantization</label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUANT_OPTIONS.slice(0, 3).map(o => (
                      <button key={o.value} onClick={() => update('quantization', o.value)}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                          config.quantization === o.value ? "bg-primary text-white border-primary" : "bg-surface-2 text-text border-border hover:bg-border-hover"
                        )}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1.5 block">Dtype</label>
                  <div className="grid grid-cols-4 gap-2">
                    {DTYPE_OPTIONS.map(d => (
                      <button key={d} onClick={() => update('dtype', d)}
                        className={cn(
                          "px-2 py-1.5 rounded-md text-xs font-medium transition-colors border",
                          config.dtype === d ? "bg-primary text-white border-primary" : "bg-surface-2 text-text border-border hover:bg-border-hover"
                        )}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1.5 block">Context Length</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={131072} step={1024} value={config.context_length} onChange={e => update('context_length', Number(e.target.value))}
                      className="flex-1" />
                    <span className="text-sm font-mono font-medium bg-surface-2 px-3 py-1.5 rounded-md border border-border w-16 text-center">
                      {config.context_length === 0 ? 'auto' : `${Math.round(config.context_length / 1024)}K`}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4 flex gap-8">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={cn("w-10 h-5 rounded-full transition-colors relative", config.enable_multimodal ? "bg-primary" : "bg-surface-2 border border-border")}
                  onClick={() => update('enable_multimodal', !config.enable_multimodal)}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm", config.enable_multimodal ? "translate-x-5" : "translate-x-0.5")} />
                </div>
                <span className="text-sm font-medium text-text group-hover:text-primary transition-colors flex items-center gap-2">
                  <MonitorSpeaker className="h-4 w-4" /> Multimodal
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={cn("w-10 h-5 rounded-full transition-colors relative", config.trust_remote_code ? "bg-primary" : "bg-surface-2 border border-border")}
                  onClick={() => update('trust_remote_code', !config.trust_remote_code)}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm", config.trust_remote_code ? "translate-x-5" : "translate-x-0.5")} />
                </div>
                <span className="text-sm font-medium text-text group-hover:text-primary transition-colors flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Trust Remote Code
                </span>
              </label>
            </CardContent>
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

          <div className="flex gap-3 pt-2">
            <Button size="lg" onClick={handleStart} disabled={loading || status.running || !config.model_path} className="gap-2">
              {loading ? <RotateCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {loading ? 'Starting...' : 'Deploy Server'}
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
