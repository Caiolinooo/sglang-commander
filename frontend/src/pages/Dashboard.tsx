import { useState, useEffect, useCallback } from 'react'
import { getServerStatus, getLatestMetrics, listLocalModels } from '../api/endpoints'
import type { ServerStatus } from '../types'

function StatCard({ label, value, unit, color, icon, trend }: {
  label: string; value: string | number | undefined; unit?: string;
  color?: string; icon?: string; trend?: 'up' | 'down' | 'stable'
}) {
  const trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : ''
  const trendColor = trend === 'up' ? 'var(--color-success)' : trend === 'down' ? 'var(--color-danger)' : 'var(--color-text-muted)'
  return (
    <div className="glass rounded-2xl p-5 animate-fade-in hover:scale-[1.02] transition-all duration-300 cursor-default">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</span>
        {icon && <span className="text-lg opacity-60">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold" style={{ color: color || 'var(--color-text)' }}>
          {value !== undefined && value !== null ? value : '--'}
        </span>
        {unit && <span className="text-sm text-text-muted">{unit}</span>}
        {trendIcon && <span className="text-xs ml-2" style={{ color: trendColor }}>{trendIcon}</span>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [status, setStatus] = useState<ServerStatus>({ running: false, health: 'stopped' })
  const [metrics, setMetrics] = useState<Record<string, number | undefined>>({} as Record<string, number | undefined>)
  const [localModels, setLocalModels] = useState<Array<{ repo_id: string; size_bytes: number }>>([])
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    const h = new Date().getHours()
    if (h < 12) setGreeting('Good morning')
    else if (h < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  const fetch = useCallback(async () => {
    try {
      const [s, m, l] = await Promise.all([
        getServerStatus(), getLatestMetrics(), listLocalModels().catch(() => ({ data: [] }))
      ])
      setStatus(s.data)
      setMetrics(m.data as unknown as Record<string, number | undefined>)
      setLocalModels(l.data || [])
    } catch {}
  }, [])

  useEffect(() => { fetch(); const i = setInterval(fetch, 5000); return () => clearInterval(i) }, [fetch])

  const running = status.running
  const health = status.health || 'stopped'
  const dotClass = running ? (health === 'healthy' ? 'running' : 'warning') : 'stopped'
  const uptimeSecs = status.uptime_seconds
  const uptime = uptimeSecs ? `${Math.floor(uptimeSecs / 60)}m ${Math.floor(uptimeSecs % 60)}s` : '--'

  const fmt = (v: number | undefined, d = 1) => v !== undefined && v !== null ? v.toFixed(d) : '--'

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{greeting}, Commander</h1>
          <p className="text-text-muted text-sm mt-0.5">Your SGLang inference hub</p>
        </div>
        <div className="flex items-center gap-3 glass rounded-xl px-4 py-2.5">
          <span className={`status-dot ${dotClass}`} />
          <div>
            <p className="text-sm font-medium">{running ? 'Server Active' : 'Server Offline'}</p>
            <p className="text-xs text-text-muted">{running ? health : 'Start a server to begin'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="GPU Utilization" value={fmt(metrics.gpu_util)} unit="%" color="#22c55e" icon={'\u26a1'} />
        <StatCard label="Throughput" value={fmt(metrics.gen_throughput)} unit="tok/s" color="#a855f7" icon={'\u21c4'} trend="up" />
        <StatCard label="VRAM" value={metrics.gpu_mem_used_mb ? (metrics.gpu_mem_used_mb / 1024).toFixed(1) : '--'} unit="GB" color="#6366f1" icon={'\ud83d\udcbe'} />
        <StatCard label="GPU Temp" value={fmt(metrics.gpu_temp_c)} unit="\u00b0C" color="#f43f5e" icon={'\ud83d\udd25'} />
        <StatCard label="Queue Depth" value={fmt(metrics.num_queue_reqs, 0)} color="#eab308" icon={'\u231b'} />
        <StatCard label="Cache Hit Rate" value={metrics.cache_hit_rate ? (metrics.cache_hit_rate * 100).toFixed(1) : '--'} unit="%" color="#06b6d4" icon={'\ud83d\udca5'} />
        <StatCard label="Avg Latency" value={fmt(metrics.e2e_latency_avg_ms)} unit="ms" color="#f97316" icon={'\u23f1\ufe0f'} />
        <StatCard label="Request Count" value={fmt(metrics.num_running_reqs, 0)} color="#14b8a6" icon={'\ud83d\udce8'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Server Info</h3>
          <div className="space-y-3">
            {[
              ['Model', status.model_path || 'Not loaded'],
              ['Host', status.host ? `${status.host}:${status.port}` : '--'],
              ['PID', status.pid?.toString() || '--'],
              ['Uptime', uptime],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                <span className="text-sm text-text-muted">{k}</span>
                <span className="text-sm font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Local Models</h3>
          {localModels.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {localModels.slice(0, 8).map((m) => (
                <div key={m.repo_id} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-sm truncate pr-2">{m.repo_id}</span>
                  <span className="text-xs text-text-muted shrink-0">{(m.size_bytes / 1e9).toFixed(1)} GB</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <span className="text-3xl mb-2 opacity-40">{'\ud83d\udc04'}</span>
              <p className="text-sm">No local models found</p>
              <p className="text-xs mt-1">Download models from the Models page</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
