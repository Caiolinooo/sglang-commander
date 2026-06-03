import { useState, useEffect, useCallback } from 'react'
import { getServerStatus, getLatestMetrics, listLocalModels } from '../api/endpoints'
import type { ServerStatus } from '../types'
import { Zap, Activity, HardDrive, Thermometer, Clock, Database, Gauge, Hash, Server, Box, Inbox } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/Button'

function StatCard({ label, value, unit, icon: Icon, colorClass }: {
  label: string; value: string | number | undefined; unit?: string;
  icon?: any; colorClass?: string;
}) {
  return (
    <Card className="hover:border-border-hover transition-colors">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</span>
          {Icon && <Icon className={cn("h-4 w-4 text-text-muted", colorClass)} />}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tracking-tight text-text">
            {value !== undefined && value !== null ? value : '--'}
          </span>
          {unit && <span className="text-sm font-medium text-text-muted">{unit}</span>}
        </div>
      </CardContent>
    </Card>
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
  const uptimeSecs = status.uptime_seconds
  const uptime = uptimeSecs ? `${Math.floor(uptimeSecs / 60)}m ${Math.floor(uptimeSecs % 60)}s` : '--'

  const fmt = (v: number | undefined, d = 1) => v !== undefined && v !== null ? v.toFixed(d) : '--'

  return (
    <div className="p-8 space-y-8 animate-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">{greeting}, Commander</h1>
          <p className="text-text-muted mt-1">Your SGLang inference hub overview</p>
        </div>
        <div className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3 shadow-sm">
          <span className={cn("relative flex h-3 w-3", running ? "" : "opacity-50")}>
            {running && health === 'healthy' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>}
            <span className={cn("relative inline-flex rounded-full h-3 w-3", running ? (health === 'healthy' ? 'bg-success' : 'bg-warning') : 'bg-text-muted')}></span>
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">{running ? 'Server Active' : 'Server Offline'}</p>
            <p className="text-xs text-text-muted mt-1">{running ? health : 'Start a server to begin'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="GPU Utilization" value={fmt(metrics.gpu_util)} unit="%" icon={Zap} colorClass="text-success" />
        <StatCard label="Throughput" value={fmt(metrics.gen_throughput)} unit="tok/s" icon={Activity} colorClass="text-primary" />
        <StatCard label="VRAM" value={metrics.gpu_mem_used_mb ? (metrics.gpu_mem_used_mb / 1024).toFixed(1) : '--'} unit="GB" icon={HardDrive} />
        <StatCard label="GPU Temp" value={fmt(metrics.gpu_temp_c)} unit="°C" icon={Thermometer} colorClass="text-danger" />
        <StatCard label="Queue Depth" value={fmt(metrics.num_queue_reqs, 0)} icon={Clock} colorClass="text-warning" />
        <StatCard label="Cache Hit Rate" value={metrics.cache_hit_rate ? (metrics.cache_hit_rate * 100).toFixed(1) : '--'} unit="%" icon={Database} colorClass="text-info" />
        <StatCard label="Avg Latency" value={fmt(metrics.e2e_latency_avg_ms)} unit="ms" icon={Gauge} />
        <StatCard label="Request Count" value={fmt(metrics.num_running_reqs, 0)} icon={Hash} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" /> Server Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ['Model', status.model_path || 'Not loaded'],
              ['Host', status.host ? `${status.host}:${status.port}` : '--'],
              ['PID', status.pid?.toString() || '--'],
              ['Uptime', uptime],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0 last:pb-0">
                <span className="text-sm font-medium text-text-muted">{k}</span>
                <span className="text-sm font-semibold text-text">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Box className="h-5 w-5 text-primary" /> Local Models</CardTitle>
          </CardHeader>
          <CardContent>
            {localModels.length > 0 ? (
              <div className="space-y-1">
                {localModels.slice(0, 6).map((m) => (
                  <div key={m.repo_id} className="flex justify-between items-center py-2.5 border-b border-border/50 last:border-0 last:pb-0">
                    <span className="text-sm font-medium text-text truncate pr-4">{m.repo_id}</span>
                    <Badge variant="outline">{(m.size_bytes / 1e9).toFixed(1)} GB</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-surface-2 flex items-center justify-center mb-4">
                  <Inbox className="h-6 w-6 text-text-muted" />
                </div>
                <h3 className="text-sm font-semibold text-text">No local models</h3>
                <p className="text-sm text-text-muted mt-1">Download models from the Models page to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
