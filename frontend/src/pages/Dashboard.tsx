import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getServerStatus, getLatestMetrics, listLocalModels } from '../api/endpoints'
import type { ServerStatus } from '../types'
import { Activity, Clock, Database, Gauge, Server, Box, Inbox, ArrowUpRight, PlayCircle, Plus, Cpu, Timer, ArrowDown, ArrowUp } from 'lucide-react'
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
    <div className="flex flex-col items-center gap-2 group relative">
      <div className="absolute inset-0 bg-current opacity-0 group-hover:opacity-[0.04] rounded-full blur-xl transition-opacity duration-500" style={{ color }} />
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-white/5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" style={{ filter: `drop-shadow(0 0 6px ${color}80)` }} />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-2xl font-extrabold text-text tracking-tighter">{value > 0 ? value.toFixed(1) : '--'}</span>
        <span className="text-[10px] font-bold text-text-muted/80 uppercase tracking-wider">{unit}</span>
      </div>
      <span className="text-[11px] font-bold text-text-muted/60 tracking-widest uppercase">{label}</span>
    </div>
  )
}

function MiniSparkline({ data, color, width = 120, height = 32 }: {
  data: number[]; color: string; width?: number; height?: number
}) {
  if (data.length < 2) return <div style={{ width, height }} className="bg-surface-2/30 rounded" />
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="overflow-visible opacity-80 group-hover:opacity-100 transition-opacity">
      <defs>
        <linearGradient id={`gradient-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`${0},${height} ${points} ${width},${height}`} fill={`url(#gradient-${color.replace('#','')})`} stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 4px ${color}60)` }} />
    </svg>
  )
}

function StatCard({ label, value, unit, icon: Icon, colorClass, active, sub, sparkData, sparkColor }: {
  label: string; value: string | number | undefined; unit?: string;
  icon?: any; colorClass?: string; active: boolean; sub?: string
  sparkData?: number[]; sparkColor?: string
}) {
  return (
    <Card className={cn("transition-all duration-500 group relative",
      active ? "hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_8px_30px_rgba(139,92,246,0.12)]" : "opacity-75 grayscale-[40%]"
    )}>
      {active && <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
      <div className="p-5 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-text-muted/60 uppercase tracking-widest">{label}</span>
          <div className={cn("p-2 rounded-xl transition-colors duration-500", active ? "bg-surface-2/50 group-hover:bg-primary/10 border border-white/5" : "bg-surface-2/30")}>
            {Icon && <Icon className={cn("h-4 w-4 transition-colors duration-500", active ? colorClass : "text-text-muted/50")} />}
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn("text-3xl font-extrabold tracking-tighter transition-colors duration-500",
            active ? "text-text" : "text-text-muted font-normal"
          )}>
            {active && value !== undefined && value !== null ? value : '--'}
          </span>
          {active && unit && <span className="text-xs font-bold text-text-muted/70 tracking-wide">{unit}</span>}
        </div>
        {sub && <p className="text-[10px] font-semibold text-text-muted/60 mt-1.5 uppercase tracking-wider">{sub}</p>}
        {active && sparkData && sparkData.length > 1 && (
          <div className="mt-3">
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
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setMetrics(data)
        setMetricsHistory(prev => {
          const keys = ['gen_throughput', 'e2e_latency_avg_ms', 'ttft_avg_ms', 'gpu_util',
            'gpu_mem_used_mb', 'num_queue_reqs', 'cache_hit_rate', 'token_usage']
          const next = { ...prev }
          for (const k of keys) {
            const val = data[k] ?? 0
            const arr = [...(prev[k] || []), val]
            next[k] = arr.slice(-60)
          }
          return next
        })
      } catch {}
    }
    ws.onerror = () => {}
    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current === ws) {
          const newWs = new WebSocket(wsUrl)
          wsRef.current = newWs
        }
      }, 5000)
    }
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



  return (
    <div className="p-8 space-y-10 animate-in max-w-[1400px] mx-auto">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-text to-text-muted">{greeting}, Commander</h1>
          <p className="text-text-muted/80 mt-2 font-medium">Here's the real-time telemetry for your SGLang engine.</p>
        </div>
        <div className="flex items-center gap-4 bg-surface/60 border border-white/5 rounded-2xl p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl min-w-[240px]">
          <span className={cn("relative flex h-4 w-4", running ? "" : "opacity-60")}>
            {running && health === 'healthy' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>}
            <span className={cn("relative inline-flex rounded-full h-4 w-4 shadow-inner", running ? (health === 'healthy' ? 'bg-success shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-warning shadow-[0_0_10px_rgba(245,158,11,0.8)]') : 'bg-text-muted/50')}></span>
          </span>
          <div>
            <p className="text-sm font-extrabold tracking-tight">{running ? 'Engine Online' : 'Engine Offline'}</p>
            <p className="text-[10px] text-text-muted mt-1 font-bold uppercase tracking-widest">{running ? `Status: ${health}` : 'Ready to ignite'}</p>
          </div>
        </div>
      </div>

      {!running && (
        <div className="relative overflow-hidden bg-surface/40 border border-primary/20 rounded-3xl p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-8 shadow-[0_8px_30px_rgba(139,92,246,0.1)] backdrop-blur-md animate-in slide-in-from-top-4">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-transparent pointer-events-none"></div>
          <div className="space-y-2 relative z-10">
            <h3 className="font-extrabold text-text text-xl flex items-center gap-2.5">
              <PlayCircle className="w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]" /> Start Inference Engine
            </h3>
            <p className="text-sm text-text-muted/80 max-w-2xl font-medium leading-relaxed">
              The SGLang engine is currently resting. Head over to the Server Control panel to select a model, fine-tune parameters, and unleash its power.
            </p>
          </div>
          <Link to="/server" className="shrink-0 relative z-10">
            <Button className="gap-2.5 px-6 py-5 text-sm font-bold shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)] transition-all rounded-xl">
              Configure & Launch <ArrowUpRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}

      {/* Hardware Monitoring */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-text-muted/60 uppercase tracking-widest flex items-center gap-2">
          <Cpu className="w-4 h-4" /> Hardware Utilization
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <Card className="hover:border-primary/30 transition-all bg-surface/50">
            <CardContent className="p-6 flex flex-col items-center relative">
              <GaugeRing value={gpuUtil} max={100} label="GPU Core" unit="%" color="#22c55e" size={110} />
            </CardContent>
          </Card>
          <Card className="hover:border-primary/30 transition-all bg-surface/50">
            <CardContent className="p-6 flex flex-col items-center relative">
              <GaugeRing value={gpuMemUsed} max={gpuMemTotal || 24} label="VRAM Allocated" unit="GB" color="#3b82f6" size={110} />
              <span className="text-[10px] font-bold text-text-muted/60 mt-1.5 uppercase tracking-wider">{gpuMemTotal > 0 ? `${memPct}% of ${gpuMemTotal.toFixed(1)}GB` : '--'}</span>
            </CardContent>
          </Card>
          <Card className="hover:border-primary/30 transition-all bg-surface/50">
            <CardContent className="p-6 flex flex-col items-center relative">
              <GaugeRing value={gpuTemp} max={100} label="Core Temp" unit="°C" color={gpuTemp > 80 ? '#ef4444' : gpuTemp > 60 ? '#f59e0b' : '#22c55e'} size={110} />
            </CardContent>
          </Card>
          <Card className="hover:border-primary/30 transition-all bg-surface/50">
            <CardContent className="p-6 flex flex-col items-center relative">
              <GaugeRing value={gpuPower} max={300} label="Power Draw" unit="W" color="#a855f7" size={110} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Inference Telemetry */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-text-muted/60 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-4 h-4" /> Inference Telemetry
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard label="Throughput" value={fmt(metrics.gen_throughput)} unit="tok/s" icon={Activity} colorClass="text-primary drop-shadow-[0_0_5px_rgba(139,92,246,0.8)]" active={running}
            sparkData={metricsHistory.gen_throughput} sparkColor="#a855f7" />
          <StatCard label="Queue Depth" value={fmt(metrics.num_queue_reqs, 0)} icon={Clock} colorClass="text-warning drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]" active={running}
            sparkData={metricsHistory.num_queue_reqs} sparkColor="#f59e0b" />
          <StatCard label="Cache Hit Rate" value={metrics.cache_hit_rate ? (metrics.cache_hit_rate * 100).toFixed(1) : undefined} unit="%" icon={Database} colorClass="text-info drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]" active={running}
            sparkData={metricsHistory.cache_hit_rate} sparkColor="#06b6d4" />
          <StatCard label="E2E Latency" value={fmt(metrics.e2e_latency_avg_ms)} unit="ms" icon={Gauge} colorClass="text-success drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]" active={running}
            sparkData={metricsHistory.e2e_latency_avg_ms} sparkColor="#22c55e" />
        </div>
      </div>

      {/* Additional Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex flex-col bg-surface/40">
          <CardHeader className="border-b border-white/5 bg-surface-2/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
                <Server className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle>Session Details</CardTitle>
                <CardDescription>Active SGLang configuration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center p-6">
            {running ? (
              <div className="space-y-3 w-full">
                {[
                  ['Active Model', status.model_path || 'Not loaded'],
                  ['API Endpoint', status.host ? `${status.host}:${status.port}` : '--'],
                  ['Process ID', status.pid?.toString() || '--'],
                  ['Uptime', uptime],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-2.5 border-b border-white/5 last:border-0 last:pb-0 group">
                    <span className="text-xs font-bold text-text-muted/70 uppercase tracking-wide group-hover:text-text-muted transition-colors">{k}</span>
                    <span className="text-xs font-mono font-bold text-text bg-surface-2/60 px-3 py-1.5 rounded-lg border border-white/5 max-w-[280px] truncate shadow-inner">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-14 w-14 rounded-2xl bg-surface-2/40 flex items-center justify-center mb-4 border border-white/5 shadow-inner">
                  <Inbox className="h-6 w-6 text-text-muted/40" />
                </div>
                <h3 className="text-sm font-extrabold text-text">No Session Details</h3>
                <p className="text-xs text-text-muted/60 mt-1.5 max-w-[280px] font-medium leading-relaxed">
                  Start the inference engine to populate configuration and connection details.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col bg-surface/40">
          <CardHeader className="border-b border-white/5 bg-surface-2/10">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-info/10 rounded-lg border border-info/20">
                  <Box className="h-4 w-4 text-info" />
                </div>
                <div>
                  <CardTitle>Local Arsenal</CardTitle>
                  <CardDescription>Available weights on host</CardDescription>
                </div>
              </div>
              <Link to="/models">
                <Button variant="ghost" size="sm" className="text-xs gap-1.5 font-bold hover:bg-surface-2/80 rounded-lg">
                  Explore Hub <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center p-6">
            {localModels.length > 0 ? (
              <div className="space-y-3 w-full">
                {localModels.slice(0, 5).map((m) => (
                  <div key={m.repo_id} className="flex justify-between items-center p-3.5 rounded-xl bg-surface-2/30 border border-white/5 hover:border-white/10 hover:bg-surface-2/50 transition-all duration-300">
                    <span className="text-xs font-bold text-text truncate pr-4 font-mono tracking-tight">{m.repo_id}</span>
                    <Badge variant="outline" className="font-mono font-bold bg-black/20 border-white/10 text-[10px]">{(m.size_bytes / 1e9).toFixed(1)} GB</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-14 w-14 rounded-2xl bg-surface-2/40 flex items-center justify-center mb-4 border border-white/5 shadow-inner">
                  <Inbox className="h-6 w-6 text-text-muted/40" />
                </div>
                <h3 className="text-sm font-extrabold text-text">No Models Downloaded</h3>
                <p className="text-xs text-text-muted/60 mt-1.5 max-w-[280px] font-medium leading-relaxed">
                  Head over to the Models Hub to browse, search, and download weights securely.
                </p>
                <Link to="/models" className="mt-5">
                  <Button variant="outline" size="sm" className="gap-2 text-xs font-bold rounded-xl border-white/10 hover:bg-surface-2">
                    <Plus className="w-3.5 h-3.5" /> Add Model
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Engine Metrics Footer */}
      {running && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[
            { label: 'Context Len', value: metrics.context_len ? `${(metrics.context_len / 1000).toFixed(0)}K` : '--', icon: Cpu },
            { label: 'Utilization', value: metrics.utilization !== undefined ? `${(metrics.utilization * 100).toFixed(1)}%` : '--', icon: Gauge },
            { label: 'Queue Time', value: metrics.queue_time_avg_ms !== undefined ? `${metrics.queue_time_avg_ms.toFixed(1)}ms` : '--', icon: Timer },
            { label: 'Token Usage', value: metrics.token_usage !== undefined ? `${(metrics.token_usage * 100).toFixed(1)}%` : '--', icon: Database },
            { label: 'Retracted Reqs', value: fmt(metrics.num_retracted_reqs, 0), icon: ArrowDown },
            { label: 'New Token Ratio', value: metrics.new_token_ratio !== undefined ? metrics.new_token_ratio.toFixed(2) : '--', icon: ArrowUp },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-surface/30 backdrop-blur-sm border border-white/5 rounded-xl p-3 flex items-center gap-3 hover:bg-surface/50 transition-colors">
              <div className="p-1.5 rounded-lg bg-surface-2/50 border border-white/5">
                <Icon className="h-3.5 w-3.5 text-text-muted/70" />
              </div>
              <div>
                <p className="text-[9px] text-text-muted/60 uppercase font-bold tracking-widest">{label}</p>
                <p className="text-xs font-extrabold text-text mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
