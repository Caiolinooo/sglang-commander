import { useState, useEffect, useRef, useMemo } from 'react'
import { startServer, stopServer, restartServer, getServerStatus, getServerLogs, listServerProfiles, getActiveProfile } from '../api/endpoints'
import type { ServerProfile } from '../types'

const MODEL_PRESETS = [
  { id: 'llama3.1-8b', name: 'Llama 3.1 8B', path: 'meta-llama/Llama-3.1-8B-Instruct', icon: '🦙', desc: 'General purpose, fast', quant: '', ctx: 8192 },
  { id: 'llama3.1-70b', name: 'Llama 3.1 70B', path: 'meta-llama/Llama-3.1-70B-Instruct', icon: '🦙', desc: 'High quality, needs VRAM', quant: 'awq', ctx: 8192 },
  { id: 'qwen2.5-7b', name: 'Qwen 2.5 7B', path: 'Qwen/Qwen2.5-7B-Instruct', icon: '💎', desc: 'Multilingual, coding', quant: '', ctx: 32768 },
  { id: 'qwen2.5-72b', name: 'Qwen 2.5 72B', path: 'Qwen/Qwen2.5-72B-Instruct', icon: '💎', desc: 'Top-tier, needs 2+ GPUs', quant: 'awq', ctx: 32768 },
  { id: 'deepseek-v3', name: 'DeepSeek V3', path: 'deepseek-ai/DeepSeek-V3-0324', icon: '🔮', desc: 'MoE, excellent reasoning', quant: 'fp8', ctx: 16384 },
  { id: 'phi-4', name: 'Phi-4 14B', path: 'microsoft/phi-4', icon: '🔬', desc: 'Compact, Microsoft research', quant: '', ctx: 16384 },
  { id: 'mistral-nemo', name: 'Mistral Nemo', path: 'mistralai/Mistral-Nemo-Instruct-2407', icon: '🌊', desc: 'Fast 12B, multilingual', quant: '', ctx: 128000 },
  { id: 'gemma2-9b', name: 'Gemma 2 9B', path: 'google/gemma-2-9b-it', icon: '💎', desc: 'Google, efficient', quant: '', ctx: 8192 },
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
  const dotClass = status.running ? (status.health === 'healthy' ? 'running' : 'warning') : 'stopped'
  const update = (f: string, v: unknown) => setConfig(p => ({ ...p, [f]: v }))

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Server Control</h1>
          <p className="text-text-muted text-sm mt-0.5">Configure and launch your SGLang server</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 glass rounded-xl px-4 py-2.5">
            <span className={`status-dot ${dotClass}`} />
            <div>
              <p className="text-xs font-semibold">{status.running ? 'Running' : 'Stopped'}</p>
              {status.running && <p className="text-[10px] text-text-muted">{uptime} | {status.model_path.split('/').pop()}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['config', 'logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
              tab === t ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'glass hover:bg-surface-2'
            }`}>
            {t === 'config' ? '\u2699\ufe0f Configuration' : '\ud83d\udcdd Logs'}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <div className="space-y-5">
          {/* Model Presets */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Quick Select Model</h3>
              {selectedPreset && (
                <button onClick={() => { setSelectedPreset(null); setConfig(p => ({ ...p, model_path: '' })) }}
                  className="text-xs text-primary hover:underline">
                  Clear selection
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MODEL_PRESETS.map(preset => (
                <button key={preset.id} onClick={() => selectPreset(preset)}
                  className={`glass rounded-xl p-3 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 ${
                    selectedPreset === preset.id ? 'ring-2 ring-primary/60 bg-primary/5' : 'hover:bg-surface-2'
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{preset.icon}</span>
                    <span className="text-sm font-medium truncate">{preset.name}</span>
                  </div>
                  <p className="text-[10px] text-text-muted truncate">{preset.desc}</p>
                  <p className="text-[10px] text-text-muted font-mono mt-1 truncate">{preset.path}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Model Input */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Or Enter Model Path</h3>
            <div className="relative" ref={modelInputRef}>
              <input
                value={config.model_path}
                onChange={e => { setConfig(p => ({ ...p, model_path: e.target.value })); setSelectedPreset(null); setShowModelDropdown(true) }}
                onFocus={() => setShowModelDropdown(true)}
                placeholder="e.g. meta-llama/Llama-3.1-8B-Instruct or /path/to/local/model"
                className="w-full px-4 py-3 rounded-xl glass border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition"
              />
              {showModelDropdown && filteredModels.length > 0 && (
                <div className="absolute z-50 w-full mt-1 glass rounded-xl border border-border shadow-xl max-h-48 overflow-y-auto">
                  {filteredModels.map(m => (
                    <button key={m.id} onClick={() => selectPreset(m)}
                      className="w-full px-4 py-2.5 text-left hover:bg-primary/10 transition text-sm flex items-center gap-2">
                      <span>{m.icon}</span>
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-[10px] text-text-muted">{m.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Server Settings */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Server Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-text-muted">Host</label>
                <input value={config.host} onChange={e => update('host', e.target.value)}
                  className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition"
                  placeholder="127.0.0.1" />
              </div>
              <div>
                <label className="text-xs text-text-muted">Port</label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input type="range" min={1024} max={65535} value={config.port} onChange={e => update('port', Number(e.target.value))}
                    className="flex-1 accent-primary" />
                  <input type="number" value={config.port} onChange={e => update('port', Number(e.target.value))}
                    className="w-20 px-2 py-2 rounded-lg bg-bg border border-border text-sm text-center" />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted">Tensor Parallel</label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input type="range" min={1} max={8} value={config.tensor_parallel_size} onChange={e => update('tensor_parallel_size', Number(e.target.value))}
                    className="flex-1 accent-primary" />
                  <span className="text-sm font-mono w-8 text-center">{config.tensor_parallel_size}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Model Settings */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Model Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-text-muted">Quantization</label>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                  {QUANT_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => update('quantization', o.value)}
                      className={`px-2 py-1.5 rounded-lg text-xs transition ${
                        config.quantization === o.value ? 'bg-primary text-white' : 'glass hover:bg-surface-2'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted">Dtype</label>
                <div className="flex gap-1.5 mt-1.5">
                  {DTYPE_OPTIONS.map(d => (
                    <button key={d} onClick={() => update('dtype', d)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs transition ${
                        config.dtype === d ? 'bg-primary text-white' : 'glass hover:bg-surface-2'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted">Context Length</label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input type="range" min={0} max={131072} step={1024} value={config.context_length} onChange={e => update('context_length', Number(e.target.value))}
                    className="flex-1 accent-primary" />
                  <span className="text-sm font-mono w-16 text-right">{config.context_length === 0 ? 'auto' : `${Math.round(config.context_length / 1024)}K`}</span>
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex gap-6 mt-4 pt-4 border-t border-border/50">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className={`w-10 h-5 rounded-full transition-colors relative ${config.enable_multimodal ? 'bg-primary' : 'bg-surface-3'}`}
                  onClick={() => update('enable_multimodal', !config.enable_multimodal)}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.enable_multimodal ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs group-hover:text-primary transition-colors">Multimodal (Vision/Audio)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className={`w-10 h-5 rounded-full transition-colors relative ${config.trust_remote_code ? 'bg-primary' : 'bg-surface-3'}`}
                  onClick={() => update('trust_remote_code', !config.trust_remote_code)}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.trust_remote_code ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs group-hover:text-primary transition-colors">Trust Remote Code</span>
              </label>
            </div>
          </div>

          {/* Profiles */}
          {profiles.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Saved Profiles</h3>
              <div className="flex gap-2 flex-wrap">
                {profiles.map(p => (
                  <button key={p.id} onClick={() => loadProfile(p)}
                    className={`glass rounded-xl px-4 py-2 text-sm transition hover:bg-surface-2 ${activeProfile?.id === p.id ? 'ring-2 ring-primary/40' : ''}`}>
                    <span className="font-medium">{p.name}</span>
                    {p.is_remote && <span className="ml-1.5 text-[10px] text-info">remote</span>}
                    {activeProfile?.id === p.id && <span className="ml-1.5 text-[10px] text-success">active</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button onClick={handleStart} disabled={loading || status.running || !config.model_path}
              className="px-8 py-3 bg-gradient-to-r from-success to-emerald-600 hover:from-success hover:to-emerald-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-success/30 disabled:shadow-none flex items-center gap-2">
              {loading ? (
                <><span className="animate-spin">{'\u25cb'}</span> Starting...</>
              ) : (
                <>{'\u25b6'} Deploy Server</>
              )}
            </button>
            <button onClick={handleStop} disabled={!status.running}
              className="px-6 py-3 bg-danger hover:bg-danger/90 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all disabled:shadow-none flex items-center gap-2">
              {'\u25a0'} Stop
            </button>
            <button onClick={handleRestart} disabled={!status.running}
              className="px-6 py-3 glass hover:bg-surface-2 disabled:opacity-40 rounded-xl text-sm font-bold transition-all disabled:shadow-none flex items-center gap-2">
              {'\u21bb'} Restart
            </button>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">Server Logs</span>
            <span className="text-xs text-text-muted">{logs.length} lines</span>
          </div>
          <div className="h-96 overflow-y-auto p-4 font-mono text-xs space-y-1 bg-[#050510]">
            {logs.map((line, i) => (
              <div key={i} className="text-green-400/70 hover:text-green-300 transition-colors">{line}</div>
            ))}
            {!logs.length && <div className="text-text-muted italic py-8 text-center">Waiting for server output...</div>}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}
