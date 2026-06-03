import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getServerStatus, getLatestMetrics, listLocalModels } from '../api/endpoints'
import type { ServerStatus } from '../types'
import { Zap, Activity, HardDrive, Thermometer, Clock, Database, Gauge, Hash, Server, Box, Inbox, ArrowUpRight, PlayCircle, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { cn } from '../components/ui/Button'

function StatCard({ label, value, unit, icon: Icon, colorClass, active }: {
  label: string; value: string | number | undefined; unit?: string;
  icon?: any; colorClass?: string; active: boolean;
}) {
  return (
    <Card className={cn(
      "transition-all duration-300 group hover:-translate-y-1",
      active ? "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5" : "opacity-75"
    )}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">{label}</span>
          <div className={cn(
            "p-2 rounded-lg bg-surface-2 transition-colors duration-300", 
            active && "group-hover:bg-primary/10"
          )}>
            {Icon && <Icon className={cn("h-4 w-4 text-text-muted transition-colors duration-300", active && colorClass)} />}
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn(
            "text-3xl font-extrabold tracking-tight transition-colors duration-300",
            active ? "text-text" : "text-text-muted font-normal"
          )}>
            {active && value !== undefined && value !== null ? value : '--'}
          </span>
          {active && unit && <span className="text-sm font-semibold text-text-muted">{unit}</span>}
        </div>
        
        {/* Subtle decorative progress line for active stats */}
        {active && label === "GPU Utilization" && typeof value === 'string' && (
          <div className="w-full bg-surface-2 h-1 rounded-full mt-4 overflow-hidden">
            <div className="bg-success h-full transition-all duration-500" style={{ width: `${parseFloat(value)}%` }} />
          </div>
        )}
        {active && label === "Cache Hit Rate" && typeof value === 'string' && (
          <div className="w-full bg-surface-2 h-1 rounded-full mt-4 overflow-hidden">
            <div className="bg-info h-full transition-all duration-500" style={{ width: `${parseFloat(value)}%` }} />
          </div>
        )}
      </div>
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
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text">{greeting}, Commander</h1>
          <p className="text-text-muted mt-1">Your SGLang inference hub overview</p>
        </div>
        
        <div className="flex items-center gap-3 bg-surface-2/40 border border-border rounded-xl p-4 shadow-sm backdrop-blur-sm min-w-[220px]">
          <span className={cn("relative flex h-3 w-3", running ? "" : "opacity-60")}>
            {running && health === 'healthy' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>}
            <span className={cn("relative inline-flex rounded-full h-3 w-3", running ? (health === 'healthy' ? 'bg-success' : 'bg-warning') : 'bg-text-muted')}></span>
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">{running ? 'Server Active' : 'Server Offline'}</p>
            <p className="text-[11px] text-text-muted mt-1.5 font-medium">{running ? `Status: ${health}` : 'Ready to start'}</p>
          </div>
        </div>
      </div>

      {/* CTA Offline Banner */}
      {!running && (
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-md animate-in slide-in-from-top-4">
          <div className="space-y-1">
            <h3 className="font-bold text-text text-lg flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-primary" /> Start Inference Server
            </h3>
            <p className="text-sm text-text-muted max-w-2xl">
              The SGLang server is currently offline. Navigate to the Server Control panel to choose your model preset, adjust parameters, and launch the inference cluster.
            </p>
          </div>
          <Link to="/server" className="shrink-0">
            <Button className="gap-2 shadow-lg shadow-primary/15">
              Configure Server <ArrowUpRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="GPU Utilization" value={fmt(metrics.gpu_util)} unit="%" icon={Zap} colorClass="text-success hover:text-success" active={running} />
        <StatCard label="Throughput" value={fmt(metrics.gen_throughput)} unit="tok/s" icon={Activity} colorClass="text-primary hover:text-primary" active={running} />
        <StatCard label="VRAM" value={metrics.gpu_mem_used_mb ? (metrics.gpu_mem_used_mb / 1024).toFixed(1) : '--'} unit="GB" icon={HardDrive} active={running} />
        <StatCard label="GPU Temp" value={fmt(metrics.gpu_temp_c)} unit="°C" icon={Thermometer} colorClass="text-danger hover:text-danger" active={running} />
        <StatCard label="Queue Depth" value={fmt(metrics.num_queue_reqs, 0)} icon={Clock} colorClass="text-warning hover:text-warning" active={running} />
        <StatCard label="Cache Hit Rate" value={metrics.cache_hit_rate ? (metrics.cache_hit_rate * 100).toFixed(1) : '--'} unit="%" icon={Database} colorClass="text-info hover:text-info" active={running} />
        <StatCard label="Avg Latency" value={fmt(metrics.e2e_latency_avg_ms)} unit="ms" icon={Gauge} active={running} />
        <StatCard label="Request Count" value={fmt(metrics.num_running_reqs, 0)} icon={Hash} active={running} />
      </div>

      {/* Secondary Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Server Info Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              <CardTitle>Server Info</CardTitle>
            </div>
            <CardDescription>Details of the active SGLang session</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {running ? (
              <div className="space-y-4 w-full">
                {[
                  ['Model', status.model_path || 'Not loaded'],
                  ['Host', status.host ? `${status.host}:${status.port}` : '--'],
                  ['PID', status.pid?.toString() || '--'],
                  ['Uptime', uptime],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-2.5 border-b border-border/40 last:border-0 last:pb-0">
                    <span className="text-sm font-semibold text-text-muted">{k}</span>
                    <span className="text-sm font-mono font-medium text-text bg-surface-2/40 px-2.5 py-1 rounded-md border border-border/30 max-w-[280px] truncate">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-12 w-12 rounded-xl bg-surface-2 flex items-center justify-center mb-3.5 border border-border">
                  <Inbox className="h-5 w-5 text-text-muted" />
                </div>
                <h3 className="text-sm font-bold text-text">No Active Session</h3>
                <p className="text-xs text-text-muted mt-1 max-w-[280px]">
                  All inference services are closed. Metrics and environment details will populate here once a server starts.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Local Models Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Box className="h-5 w-5 text-primary" />
                  <CardTitle>Local Models</CardTitle>
                </div>
                <CardDescription>Available model checkpoints on host</CardDescription>
              </div>
              <Link to="/models">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  Browse Hub <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {localModels.length > 0 ? (
              <div className="space-y-2.5 w-full">
                {localModels.slice(0, 5).map((m) => (
                  <div key={m.repo_id} className="flex justify-between items-center p-3 rounded-xl bg-surface-2/20 border border-border/50 hover:border-border transition-colors duration-200">
                    <span className="text-xs font-semibold text-text truncate pr-4 font-mono">{m.repo_id}</span>
                    <Badge variant="outline" className="font-mono bg-surface-2/60">{(m.size_bytes / 1e9).toFixed(1)} GB</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-12 w-12 rounded-xl bg-surface-2 flex items-center justify-center mb-3.5 border border-border">
                  <Inbox className="h-5 w-5 text-text-muted" />
                </div>
                <h3 className="text-sm font-bold text-text">No Models Downloaded</h3>
                <p className="text-xs text-text-muted mt-1 max-w-[280px]">
                  Go to the Models Hub to browse and download model weights.
                </p>
                <Link to="/models" className="mt-4">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add Model
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

