import { useState, useEffect, useCallback } from 'react'
import { getServerStatus, getLatestMetrics } from '../api/endpoints'
import type { ServerStatus } from '../types'

function GaugeCard({ label, value, unit, color = 'var(--color-primary)' }: { label: string; value: string | number | undefined; unit?: string; color?: string }) {
  return (
    <div className="bg-surface rounded-xl p-4 border border-border">
      <p className="text-text-muted text-sm">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color }}>{value}{unit && <span className="text-lg text-text-muted ml-1">{unit}</span>}</p>
    </div>
  )
}

export default function Dashboard() {
  const [status, setStatus] = useState<ServerStatus>({ running: false, health: 'stopped' })
  const [metrics, setMetrics] = useState<Record<string, number | undefined>>({} as Record<string, number | undefined>)

  const fetch = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([getServerStatus(), getLatestMetrics()])
      setStatus(s.data)
      setMetrics(m.data as unknown as Record<string, number | undefined>)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, 5000)
    return () => clearInterval(interval)
  }, [fetch])

  const running = status.running
  const healthColor = status.health === 'healthy' ? 'var(--color-primary)' : status.running ? '#eab308' : '#ef4444'

  const fmtMetric = (val: number | undefined, decimals = 1) =>
    val !== undefined && val !== null ? val.toFixed(decimals) : '--'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full`} style={{ backgroundColor: healthColor }} />
          <span className="text-text-muted">{running ? `Running - ${status.health}` : 'Stopped'}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <GaugeCard label="GPU Utilization" value={fmtMetric(metrics.gpu_util)} unit="%" color="#22c55e" />
        <GaugeCard label="Tokens/sec" value={fmtMetric(metrics.gen_throughput)} unit="" color="#a855f7" />
        <GaugeCard label="GPU Temp" value={fmtMetric(metrics.gpu_temp_c)} unit="°C" color="#ef4444" />
        <GaugeCard label="VRAM" value={metrics.gpu_mem_used_mb ? (metrics.gpu_mem_used_mb / 1024).toFixed(1) : '--'} unit="GB" color="#3b82f6" />
        <GaugeCard label="Queue" value={fmtMetric(metrics.num_queue_reqs, 0)} color="#eab308" />
        <GaugeCard label="Cache Hit" value={metrics.cache_hit_rate ? (metrics.cache_hit_rate * 100).toFixed(1) : '--'} unit="%" color="#06b6d4" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="text-text-muted text-sm mb-2">Server Info</h3>
          <div className="space-y-1 text-sm">
            <p><span className="text-text-muted">Model:</span> {status.model_path || 'N/A'}</p>
            <p><span className="text-text-muted">PID:</span> {status.pid || 'N/A'}</p>
            <p><span className="text-text-muted">Uptime:</span> {status.uptime_seconds ? `${(status.uptime_seconds / 60).toFixed(1)} min` : 'N/A'}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="text-text-muted text-sm mb-2">System</h3>
          <div className="space-y-1 text-sm">
            <p><span className="text-text-muted">CPU:</span> {fmtMetric(metrics.cpu_percent)}%</p>
            <p><span className="text-text-muted">RAM:</span> {fmtMetric(metrics.ram_percent)}%</p>
          </div>
        </div>
      </div>
    </div>
  )
}
