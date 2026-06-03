import { useState, useEffect, useRef } from 'react'
import { startServer, stopServer, restartServer, getServerStatus, getServerLogs, healthCheck, listServerProfiles, getActiveProfile } from '../api/endpoints'
import type { ServerProfile } from '../types'

export default function ServerPage() {
  const [config, setConfig] = useState({
    model_path: '', host: '127.0.0.1', port: 30000, tensor_parallel_size: 1,
    quantization: '', dtype: 'auto', context_length: 0, enable_multimodal: false, trust_remote_code: false,
  })
  const [status, setStatus] = useState({ running: false, health: 'stopped', pid: null as number | null })
  const [logs, setLogs] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(false)
  const [profiles, setProfiles] = useState<ServerProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<ServerProfile | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchStatus(); fetchProfiles() }, [])

  const fetchProfiles = async () => {
    try {
      const [p, a] = await Promise.all([listServerProfiles(), getActiveProfile()])
      setProfiles(p.data)
      setActiveProfile(a.data)
    } catch {}
  }

  const loadProfile = (profile: ServerProfile) => {
    let args = {}
    try { args = JSON.parse(profile.args_json || '{}') } catch {}
    const parsed = args as Record<string, unknown>
    setConfig({
      model_path: profile.model_path,
      host: profile.host,
      port: profile.port,
      tensor_parallel_size: (parsed.tensor_parallel_size as number) || 1,
      quantization: (parsed.quantization as string) || '',
      dtype: (parsed.dtype as string) || 'auto',
      context_length: (parsed.context_length as number) || 0,
      enable_multimodal: (parsed.enable_multimodal as boolean) || false,
      trust_remote_code: (parsed.trust_remote_code as boolean) || false,
    })
  }

  const fetchStatus = async () => {
    try {
      const s = await getServerStatus()
      setStatus({ running: s.data.running, health: s.data.health || 'stopped', pid: s.data.pid || null })
    } catch { /* ignore */ }
  }

  const fetchLogs = async () => {
    try {
      const resp = await getServerLogs(cursor)
      if (resp.data.lines?.length) {
        setLogs((prev) => [...prev, ...resp.data.lines])
        setCursor(resp.data.cursor)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const interval = setInterval(() => { fetchStatus(); fetchLogs() }, 3000)
    return () => clearInterval(interval)
  }, [cursor])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleStart = async () => {
    setLoading(true)
    try {
      await startServer({
        model_path: config.model_path,
        host: config.host, port: config.port,
        tensor_parallel_size: config.tensor_parallel_size,
        quantization: config.quantization || undefined,
        dtype: config.dtype !== 'auto' ? config.dtype : undefined,
        context_length: config.context_length > 0 ? config.context_length : undefined,
        enable_multimodal: config.enable_multimodal,
        trust_remote_code: config.trust_remote_code,
      })
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  const handleStop = async () => { try { await stopServer() } catch {} }
  const handleRestart = async () => { try { await restartServer() } catch {} }
  const handleHealth = async () => { const r = await healthCheck(); alert(JSON.stringify(r.data)) }

  const update = (field: string, value: unknown) => setConfig((prev) => ({ ...prev, [field]: value }))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Server Control</h1>
        <div className="flex items-center gap-4">
          {profiles.length > 0 && (
            <select
              value={activeProfile?.id || ''}
              onChange={(e) => {
                const p = profiles.find(p => p.id === Number(e.target.value))
                if (p) loadProfile(p)
              }}
              className="px-3 py-1.5 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Manual Config</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.is_remote ? ' (remote)' : ''}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${status.running ? (status.health === 'healthy' ? 'bg-green-500' : 'bg-yellow-500') : 'bg-red-500'}`} />
            <span className="text-text-muted">{status.running ? `Running${status.pid ? ` (PID: ${status.pid})` : ''}` : 'Stopped'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Model Path</label>
          <input value={config.model_path} onChange={(e) => update('model_path', e.target.value)}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="meta-llama/Llama-3.1-8B-Instruct" />
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Host</label>
          <input value={config.host} onChange={(e) => update('host', e.target.value)}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Port</label>
          <input type="number" value={config.port} onChange={(e) => update('port', parseInt(e.target.value))}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Tensor Parallel</label>
          <input type="number" min={1} max={8} value={config.tensor_parallel_size}
            onChange={(e) => update('tensor_parallel_size', parseInt(e.target.value))}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Quantization</label>
          <select value={config.quantization} onChange={(e) => update('quantization', e.target.value)}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">None</option>
            <option value="awq">AWQ</option>
            <option value="fp8">FP8</option>
            <option value="gptq">GPTQ</option>
            <option value="marlin">Marlin</option>
            <option value="gguf">GGUF</option>
          </select>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Options</label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={config.enable_multimodal}
              onChange={(e) => update('enable_multimodal', e.target.checked)}
              className="accent-primary" />
            Multimodal
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
            <input type="checkbox" checked={config.trust_remote_code}
              onChange={(e) => update('trust_remote_code', e.target.checked)}
              className="accent-primary" />
            Trust Remote Code
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleStart} disabled={loading || status.running}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition">
          {loading ? 'Starting...' : '▶ Start'}
        </button>
        <button onClick={handleStop} disabled={!status.running}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition">
          ■ Stop
        </button>
        <button onClick={handleRestart} disabled={!status.running}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg transition">
          🔄 Restart
        </button>
        <button onClick={handleHealth} disabled={!status.running}
          className="px-4 py-2 bg-surface-2 hover:bg-surface text-white rounded-lg transition">
          Health Check
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border">
        <h3 className="text-sm text-text-muted px-4 py-2 border-b border-border">Server Log</h3>
        <div className="h-64 overflow-y-auto p-4 font-mono text-sm space-y-0.5 bg-[#0a0a1a] rounded-b-xl">
          {logs.map((line, i) => (
            <div key={i} className="text-green-400/80">{line}</div>
          ))}
          {!logs.length && <div className="text-text-muted italic">Waiting for logs...</div>}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}
