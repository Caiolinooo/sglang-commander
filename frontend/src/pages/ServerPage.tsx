import { useState, useEffect, useRef } from 'react'
import { startServer, stopServer, restartServer, getServerStatus, getServerLogs, listServerProfiles, getActiveProfile } from '../api/endpoints'
import type { ServerProfile } from '../types'

const QUANT_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'awq', label: 'AWQ 4-bit' },
  { value: 'fp8', label: 'FP8' },
  { value: 'gptq', label: 'GPTQ 4-bit' },
  { value: 'marlin', label: 'Marlin 4-bit' },
  { value: 'gguf', label: 'GGUF' },
  { value: 'bitsandbytes', label: 'Bitsandbytes' },
]

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
  const logEndRef = useRef<HTMLDivElement>(null)

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
  }

  const handleStart = async () => { setLoading(true); try { await startServer(config) } catch (e) { console.error(e) } finally { setLoading(false) } }
  const handleStop = async () => { try { await stopServer() } catch {} }
  const handleRestart = async () => { try { await restartServer() } catch {} }

  const uptime = status.uptime_seconds ? `${Math.floor(status.uptime_seconds / 60)}m ${Math.floor(status.uptime_seconds % 60)}s` : '--'
  const dotClass = status.running ? (status.health === 'healthy' ? 'running' : 'warning') : 'stopped'

  const update = (f: string, v: unknown) => setConfig(p => ({ ...p, [f]: v }))

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Server Control</h1>
          <p className="text-text-muted text-sm mt-0.5">Manage your SGLang inference server</p>
        </div>
        <div className="flex items-center gap-4">
          {profiles.length > 0 && (
            <select value={activeProfile?.id || ''} onChange={e => { const p = profiles.find(x => x.id === Number(e.target.value)); if (p) loadProfile(p) }}
              className="px-3 py-2 rounded-xl glass text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">Manual Config</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_remote ? ' (remote)' : ''}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2 glass rounded-xl px-4 py-2">
            <span className={`status-dot ${dotClass}`} />
            <div>
              <p className="text-xs font-medium">{status.running ? 'Active' : 'Stopped'}</p>
              {status.running && <p className="text-[10px] text-text-muted">{uptime}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {['config', 'logs'].map(t => (
          <button key={t} onClick={() => setTab(t as typeof tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
              tab === t ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'glass hover:bg-surface-2'
            }`}>
            {t === 'config' ? '\u2699\ufe0f Configuration' : '\ud83d\udcdd Logs'}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass rounded-xl p-4">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Model Path</label>
              <input value={config.model_path} onChange={e => update('model_path', e.target.value)}
                className="w-full mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition"
                placeholder="meta-llama/Llama-3.1-8B" />
            </div>
            <div className="glass rounded-xl p-4">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Host</label>
              <input value={config.host} onChange={e => update('host', e.target.value)}
                className="w-full mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition" />
            </div>
            <div className="glass rounded-xl p-4">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Port</label>
              <input type="number" value={config.port} onChange={e => update('port', Number(e.target.value))}
                className="w-full mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition" />
            </div>
            <div className="glass rounded-xl p-4">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Tensor Parallel</label>
              <input type="number" min={1} max={8} value={config.tensor_parallel_size} onChange={e => update('tensor_parallel_size', Number(e.target.value))}
                className="w-full mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition" />
            </div>
            <div className="glass rounded-xl p-4">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Quantization</label>
              <select value={config.quantization} onChange={e => update('quantization', e.target.value)}
                className="w-full mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition">
                {QUANT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="glass rounded-xl p-4">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Dtype</label>
              <select value={config.dtype} onChange={e => update('dtype', e.target.value)}
                className="w-full mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition">
                {['auto', 'half', 'bfloat16', 'float32'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="glass rounded-xl p-4">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Context Length</label>
              <input type="number" value={config.context_length} onChange={e => update('context_length', Number(e.target.value))}
                className="w-full mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition" />
            </div>
            <div className="glass rounded-xl p-4 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={config.enable_multimodal} onChange={e => update('enable_multimodal', e.target.checked)}
                  className="accent-primary w-4 h-4" />
                Multimodal (vision/audio)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={config.trust_remote_code} onChange={e => update('trust_remote_code', e.target.checked)}
                  className="accent-primary w-4 h-4" />
                Trust Remote Code
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleStart} disabled={loading || status.running || !config.model_path}
              className="px-5 py-2.5 bg-success hover:bg-success/90 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-success/20">
              {loading ? 'Starting...' : '\u25b6 Deploy Server'}
            </button>
            <button onClick={handleStop} disabled={!status.running}
              className="px-5 py-2.5 bg-danger hover:bg-danger/90 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition">
              '\u25a0 Stop'
            </button>
            <button onClick={handleRestart} disabled={!status.running}
              className="px-5 py-2.5 glass hover:bg-surface-2 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition">
              '\ud83d\udd04 Restart'
            </button>
          </div>
        </>
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
