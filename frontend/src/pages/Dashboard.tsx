import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getServerStatus, getLatestMetrics, listLocalModels } from '../api/endpoints'
import type { ServerStatus } from '../types'
import { Zap, Activity, Clock, Database, Gauge, Hash, Server, Box, Inbox, ArrowUpRight, PlayCircle, Plus, Cpu, MemoryStick, Timer, TrendingUp, ArrowDown, ArrowUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { cn } from '../components/ui/Button'

function GaugeRing({ value, max, label, unit, color, size = 120 }: {
  value: number; max: number; label: string; unit: string; color: string; size?: number
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-surface-2" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xl font-extrabold text-text">{value > 0 ? value.toFixed(1) : '--'}</span>
        <span className="text-[10px] font-semibold text-text-muted uppercase">{unit}</span>
      </div>
      <span className="text-xs font-semibold text-text-muted">{label}</span>
    </div>
  )
}

function MiniSparkline({ data, color, width = 120, height = 32 }: {
  data: number[]; color: string; width?: number; height?: number
}) {
  if (data.length < 2) return <div style={{ width, height }} className="bg-surface-2 rounded" />
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatCard({ label, value, unit, icon: Icon, colorClass, active, sub, sparkData, sparkColor }: {
  label: string; value: string | number | undefined; unit?: string;
  icon?: any; colorClass?: string; active: boolean; sub?: string
  sparkData?: number[]; sparkColor?: string
}) {
  return (
    <Card className={cn("transition-all duration-300 group hover:-translate-y-1",
      active ? "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5" : "opacity-80"
    )}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">{label}</span>
          <div className={cn("p-2 rounded-lg bg-surface-2 transition-colors duration-300", active && "group-hover:bg-primary/10")}>
            {Icon && <Icon className={cn("h-4 w-4 text-text-muted transition-colors duration-300", active && colorClass)} />}
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn("text-3xl font-extrabold tracking-tight transition-colors duration-300",
            active ? "text-text" : "text-text-muted font-normal"
          )}>
            {active && value !== undefined && value !== null ? value : '--'}
          </span>
          {active && unit && <span className="text-sm font-semibold text-text-muted">{unit}</span>}
        </div>
        {sub && <p className="text-[11px] text-text-muted mt-1.5">{sub}</p>}
        {active && sparkData && sparkData.length > 1 && (
          <div className="mt-2 opacity-70">
            <MiniSparkline data={sparkData} color={sparkColor || '#3b82f6'} />
          </div>
        )}
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const [status, setStatus] = useState<ServerStatus>({ running: false, health: 'stopped' })
  const [metrics, setMetrics] = useState<Record<string, number | undefined>>({})
  const [localModels, setLocalModels] = useState<Array<{ repo_id: string; size_bytes: number }>>([])
  const [greeting, setGreeting] = useState('')
  const [metricsHistory, setMetricsHistory] = useState<Record<string, number[]>>({
    gen_throughput: [], e2e_latency_avg_ms: [], ttft_avg_ms: [], gpu_util: [],
    gpu_mem_used_mb: [], num_queue_reqs: [], cache_hit_rate: [], token_usage: [],
  })
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const h = new Date().getHours()
    if (h < 12) setGreeting('Good morning')
    else if (h < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  const fetch = useCallback(async () => {
    try {
      const [s, m, l] = await Promise.all([
        getServerStatus().catch(() => ({ data: { running: false, health: 'stopped' } })),
        getLatestMetrics().catch(() => ({ data: {} })),
        listLocalModels().catch(() => ({ data: [] })),
      ])
      setStatus(s.data)
      const mData = m.data as Record<string, number | undefined>
      setMetrics(mData)
      setLocalModels(l.data || [])

      setMetricsHistory(prev => {
        const keys = ['gen_throughput', 'e2e_latency_avg_ms', 'ttft_avg_ms', 'gpu_util',
          'gpu_mem_used_mb', 'num_queue_reqs', 'cache_hit_rate', 'token_usage']
        const next = { ...prev }
        for (const k of keys) {
          const val = mData[k] ?? 0
          const arr = [...(prev[k] || []), val]
          next[k] = arr.slice(-60)
        }
        return next
      })
    } catch {}
  }, [])

  useEffect(() => {
    fetch()
    const i = setInterval(fetch, 3000)
    return () => clearInterval(i)
  }, [fetch])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${window.location.host}/ws/metrics`

    function connectWs() {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'metrics_snapshot' && parsed.data) {
            const mData = parsed.data
            setMetrics(mData)
            setMetricsHistory(prev => {
              const keys = ['gen_throughput', 'e2e_latency_avg_ms', 'ttft_avg_ms', 'gpu_util',
                'gpu_mem_used_mb', 'num_queue_reqs', 'cache_hit_rate', 'token_usage']
              const next = { ...prev }
              for (const k of keys) {
                const val = mData[k] ?? 0
                const arr = [...(prev[k] || []), val]
                next[k] = arr.slice(-60)
              }
              return next
            })
          }
        } catch {}
      }
      ws.onerror = () => {}
      ws.onclose = () => {
        setTimeout(() => {
          if (wsRef.current === ws) {
            connectWs()
          }
        }, 5000)
      }
    }

    connectWs()
    return () => { ws.close(); wsRef.current = null }
  }, [])

  const running = status.running
  const health = status.health || 'stopped'
  const uptimeSecs = status.uptime_seconds
  const uptime = uptimeSecs ? `${Math.floor(uptimeSecs / 60)}m ${Math.floor(uptimeSecs % 60)}s` : '--'

  const fmt = (v: number | undefined, d = 1) => v !== undefined && v !== null ? v.toFixed(d) : '--'

  const gpuUtil = metrics.gpu_util ?? 0
  const gpuMemUsed = metrics.gpu_mem_used_mb ? metrics.gpu_mem_used_mb / 1024 : 0
  const gpuMemTotal = metrics.gpu_mem_total_mb ? metrics.gpu_mem_total_mb / 1024 : 0
  const gpuTemp = metrics.gpu_temp_c ?? 0
  const gpuPower = metrics.gpu_power_w ?? 0
  const memPct = gpuMemTotal > 0 ? ((gpuMemUsed / gpuMemTotal) * 100).toFixed(1) : '0'

  const kvUsed = metrics.num_used_tokens ?? 0
  const kvMax = metrics.max_total_num_tokens ?? 0
  const kvPct = kvMax > 0 ? ((kvUsed / kvMax) * 100).toFixed(1) : '0'

  return (
    <div className="p-8 space-y-8 animate-in max-w-7xl mx-auto">
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

      {!running && (
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-md animate-in slide-in-from-top-4">
          <div className="space-y-1">
            <h3 className="font-bold text-text text-lg flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-primary" /> Start Inference Server
            </h3>
            <p className="text-sm text-text-muted max-w-2xl">
              The SGLang server is currently offline. Navigate to the Server Control panel to choose your model, adjust parameters, and launch.
            </p>
          </div>
          <Link to="/server" className="shrink-0">
            <Button className="gap-2 shadow-lg shadow-primary/15">
              Configure Server <ArrowUpRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}

      {/* GPU Gauges - Always visible */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:border-primary/30 transition-all">
          <CardContent className="p-6 flex flex-col items-center relative">
            <GaugeRing value={gpuUtil} max={100} label="GPU Util" unit="%" color="#22c55e" size={110} />
          </CardContent>
        </Card>
        <Card className="hover:border-primary/30 transition-all">
          <CardContent className="p-6 flex flex-col items-center relative">
            <GaugeRing value={gpuMemUsed} max={gpuMemTotal || 24} label="VRAM" unit="GB" color="#3b82f6" size={110} />
            <span className="text-[10px] text-text-muted mt-1">{gpuMemTotal > 0 ? `${memPct}% of ${gpuMemTotal.toFixed(1)}GB` : '--'}</span>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/30 transition-all">
          <CardContent className="p-6 flex flex-col items-center relative">
            <GaugeRing value={gpuTemp} max={100} label="Temperature" unit="C" color={gpuTemp > 80 ? '#ef4444' : gpuTemp > 60 ? '#f59e0b' : '#22c55e'} size={110} />
          </CardContent>
        </Card>
        <Card className="hover:border-primary/30 transition-all">
          <CardContent className="p-6 flex flex-col items-center relative">
            <GaugeRing value={gpuPower} max={100} label="Power" unit="W" color="#a855f7" size={110} />
          </CardContent>
        </Card>
      </div>

      {/* Inference Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Throughput" value={fmt(metrics.gen_throughput)} unit="tok/s" icon={Activity} colorClass="text-primary" active={running}
          sparkData={metricsHistory.gen_throughput} sparkColor="#a855f7" />
        <StatCard label="Queue Depth" value={fmt(metrics.num_queue_reqs, 0)} icon={Clock} colorClass="text-warning" active={running}
          sparkData={metricsHistory.num_queue_reqs} sparkColor="#f59e0b" />
        <StatCard label="Cache Hit" value={metrics.cache_hit_rate ? (metrics.cache_hit_rate * 100).toFixed(1) : undefined} unit="%" icon={Database} colorClass="text-info" active={running}
          sparkData={metricsHistory.cache_hit_rate} sparkColor="#06b6d4" />
        <StatCard label="E2E Latency" value={fmt(metrics.e2e_latency_avg_ms)} unit="ms" icon={Gauge} active={running}
          sparkData={metricsHistory.e2e_latency_avg_ms} sparkColor="#22c55e" />
        <StatCard label="TTFT" value={fmt(metrics.ttft_avg_ms)} unit="ms" icon={Zap} colorClass="text-success" active={running}
          sparkData={metricsHistory.ttft_avg_ms} sparkColor="#22c55e" />
        <StatCard label="KV Cache" value={kvPct} unit={`% (${kvUsed}/${kvMax})`} icon={MemoryStick} colorClass="text-primary" active={running} />
        <StatCard label="Running Reqs" value={fmt(metrics.num_running_reqs, 0)} icon={Hash} active={running} />
        <StatCard label="Total Tokens" value={fmt(metrics.prompt_tokens_total, 0)} unit="prompt" icon={TrendingUp} active={running}
          sub={metrics.generation_tokens_total ? `gen: ${fmt(metrics.generation_tokens_total, 0)}` : undefined} />
      </div>

      {/* Additional sglang metrics row */}
      {running && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'Context Len', value: metrics.context_len ? `${(metrics.context_len / 1000).toFixed(0)}K` : '--', icon: Cpu },
            { label: 'Utilization', value: metrics.utilization !== undefined ? `${(metrics.utilization * 100).toFixed(1)}%` : '--', icon: Gauge },
            { label: 'Queue Time', value: metrics.queue_time_avg_ms !== undefined ? `${metrics.queue_time_avg_ms.toFixed(1)}ms` : '--', icon: Timer },
            { label: 'Token Usage', value: metrics.token_usage !== undefined ? `${(metrics.token_usage * 100).toFixed(1)}%` : '--', icon: Database },
            { label: 'Retracted', value: fmt(metrics.num_retracted_reqs, 0), icon: ArrowDown },
            { label: 'New Token Ratio', value: metrics.new_token_ratio !== undefined ? metrics.new_token_ratio.toFixed(2) : '--', icon: ArrowUp },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="hover:border-primary/20 transition-all">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-surface-2">
                  <Icon className="h-3.5 w-3.5 text-text-muted" />
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase font-semibold">{label}</p>
                  <p className="text-sm font-bold text-text">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  ['Endpoint', status.host ? `${status.host}:${status.port}` : '--'],
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
