import { useEffect } from 'react'
import { useServerStore } from '../stores'
import { HardDrive, Cpu, Layers, Activity, Thermometer, Power } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/cn'
import ServerConfigPanel from '../components/server/ServerConfigPanel'
import ServerLogViewer from '../components/server/ServerLogViewer'
import ServerPresets from '../components/server/ServerPresets'
import ValidationPanel from '../components/server/ValidationPanel'
import { calculateVRAM } from '../utils/vram'

function GPUStatusBar() {
  const { gpuStatus } = useServerStore()
  if (!gpuStatus || !gpuStatus.gpus?.length) return null
  const gpu = gpuStatus.gpus[0]

  const memPct = gpu.memory_util_pct ?? (gpu.total_mb > 0 ? (gpu.used_mb / gpu.total_mb * 100) : 0)
  const gpuPct = gpu.gpu_util_pct ?? 0
  const tempC = gpu.temperature_c ?? 0
  const tempColor = tempC > 80 ? 'text-danger' : tempC > 65 ? 'text-warning' : 'text-success'
  const memColor = memPct > 90 ? 'bg-danger' : memPct > 70 ? 'bg-warning' : 'bg-primary'

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{gpu.name}</span>
            <Badge variant="outline" className="text-[10px] py-0">GPU {gpu.index}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className={cn("flex items-center gap-1", tempColor)}>
              <Thermometer className="h-3 w-3" /> {tempC}°C
            </span>
            <span className="flex items-center gap-1 text-text-muted">
              <Power className="h-3 w-3" /> {gpu.power_w ?? '?'}W / {gpu.power_limit_w ?? '?'}W
            </span>
          </div>
        </div>

        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">VRAM</span>
            <span className="font-mono">{(gpu.used_mb / 1024).toFixed(1)} / {(gpu.total_mb / 1024).toFixed(1)} GB ({(memPct ?? 0).toFixed(0)}%)</span>
          </div>
          <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-500", memColor)}
              style={{ width: `${Math.min(memPct, 100)}%` }} />
          </div>
        </div>

        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">GPU Utilization</span>
            <span className="font-mono">{gpuPct}%</span>
            <span className="text-text-muted text-[10px] ml-auto">Mem: {(memPct ?? 0).toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-info rounded-full transition-all duration-500"
              style={{ width: `${Math.min(gpuPct, 100)}%` }} />
          </div>
        </div>

        {gpu.processes?.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
              <Activity className="h-3 w-3" /> Processes ({gpu.processes.length})
            </div>
            <div className="space-y-1">
              {gpu.processes.map((proc, i) => (
                <div key={i} className="flex items-center justify-between bg-surface-2/50 rounded px-2 py-1 text-xs">
                  <span className="text-text truncate max-w-[200px]" title={proc.name}>{proc.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted font-mono">PID {proc.pid}</span>
                    <span className="font-mono font-semibold text-warning">{proc.used_mb > 0 ? `${(proc.used_mb / 1024).toFixed(1)} GB` : '?'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function estimateParamsFromPath(path: string): number {
  const match = path.match(/[-_/](\d+(\.\d+)?)[bB]/)
  if (match) {
    return parseFloat(match[1])
  }
  return 0
}

function estimateQuantFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.includes('awq')) return 'awq'
  if (lower.includes('gptq')) return 'gptq'
  if (lower.includes('fp8')) return 'fp8'
  if (lower.includes('int4') || lower.includes('4bit')) return 'int4'
  if (lower.includes('int8') || lower.includes('8bit')) return 'int8'
  return ''
}

function VRAMAdvisor() {
  const { selectedModel, config, advanced, gpuStatus } = useServerStore()
  if (!gpuStatus || !gpuStatus.gpus?.length) return null
  const gpu = gpuStatus.gpus[0]

  const path = config.model_path
  if (!path) return null

  const paramsBillions = selectedModel?.params_billions || estimateParamsFromPath(path) || 7.0
  const quantization = config.quantization || selectedModel?.quantization || estimateQuantFromPath(path) || 'auto'

  const vram = calculateVRAM({
    paramsBillions,
    quantization,
    dtype: config.dtype || 'auto',
    contextLength: config.context_length || selectedModel?.context_length || 4096,
    memFractionStatic: advanced.mem_fraction_static,
    cpuOffloadGb: advanced.cpu_offload_gb,
    tensorParallelSize: config.tensor_parallel_size,
    epSize: advanced.ep_size,
    kvCacheDtype: advanced.kv_cache_dtype,
    maxRunningRequests: advanced.max_running_requests || 2,
    totalVramGb: gpu.total_mb / 1024,
    freeVramGb: gpu.free_mb / 1024,
    enableMultimodal: config.enable_multimodal,
    speculativeAlgorithm: advanced.speculative_algorithm,
    speculativeDraftModelPath: advanced.speculative_draft_model_path,
  })

  const modelPct = (vram.modelWeights / vram.totalVramGb) * 100
  const kvPct = (vram.kvCache / vram.totalVramGb) * 100
  const visionPct = (vram.visionTower / vram.totalVramGb) * 100
  const specPct = (vram.speculative / vram.totalVramGb) * 100
  const overheadPct = ((vram.activations + vram.frameworkOverhead) / vram.totalVramGb) * 100

  return (
    <Card className={cn("border shadow-sm", vram.fits ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-text">VRAM Allocation Estimates</span>
          </div>
          <Badge variant={vram.fits ? "success" : "danger"}>
            {vram.fits ? 'FITS' : 'OOM WARNING'}
          </Badge>
        </div>

        <div className="h-3.5 bg-surface-2 rounded-full overflow-hidden flex">
          <div style={{ width: `${modelPct}%` }} className="h-full bg-primary" title={`Model weights: ${vram.modelWeights.toFixed(1)}GB`} />
          <div style={{ width: `${kvPct}%` }} className="h-full bg-violet-400" title={`KV cache: ${vram.kvCache.toFixed(1)}GB`} />
          {visionPct > 0 && <div style={{ width: `${visionPct}%` }} className="h-full bg-emerald-400" title={`Vision Tower: ${vram.visionTower.toFixed(1)}GB`} />}
          {specPct > 0 && <div style={{ width: `${specPct}%` }} className="h-full bg-amber-400" title={`Speculative: ${vram.speculative.toFixed(1)}GB`} />}
          <div style={{ width: `${overheadPct}%` }} className="h-full bg-neutral-400" title={`Overhead: ${(vram.activations + vram.frameworkOverhead).toFixed(1)}GB`} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-surface-2/45 rounded p-1.5">
            <span className="text-[10px] text-text-muted block">Weights</span>
            <strong className="font-semibold text-text">{vram.modelWeights.toFixed(1)} GB</strong>
          </div>
          <div className="bg-surface-2/45 rounded p-1.5">
            <span className="text-[10px] text-text-muted block">KV Cache</span>
            <strong className="font-semibold text-text">{vram.kvCache.toFixed(1)} GB</strong>
          </div>
          <div className="bg-surface-2/45 rounded p-1.5">
            <span className="text-[10px] text-text-muted block">Total Needed</span>
            <strong className="font-semibold text-text">{vram.total.toFixed(1)} GB</strong>
          </div>
        </div>

        {(vram.visionTower > 0 || vram.speculative > 0) && (
          <div className="flex flex-wrap gap-2 text-[10px] text-text-muted">
            {vram.visionTower > 0 && (
              <span>• Vision Tower: <strong className="text-text">{vram.visionTower.toFixed(1)} GB</strong></span>
            )}
            {vram.speculative > 0 && (
              <span>• Speculative ({advanced.speculative_algorithm}): <strong className="text-text">{vram.speculative.toFixed(1)} GB</strong></span>
            )}
          </div>
        )}

        {!vram.fits && (
          <p className="text-[10px] text-danger font-medium leading-normal mt-1">
            * Estimation exceeds available GPU VRAM. Enable CPU offloading or use 4-bit quantizations (AWQ/FP8).
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function ServerPage() {
  const {
    status,
    tab,
    setTab,
    fetchStatus,
    fetchLogs,
    fetchProfiles,
    scanModels,
    fetchGPU,
    updateFlagIssues,
    config,
    advanced,
    selectedModel,
    gpuStatus
  } = useServerStore()

  useEffect(() => {
    fetchStatus()
    fetchProfiles()
    scanModels()
    fetchGPU()
  }, [])

  useEffect(() => {
    fetchLogs()
    const i = setInterval(() => {
      fetchStatus()
      fetchGPU()
    }, 1000)
    const li = setInterval(() => {
      fetchLogs()
    }, 2000)
    return () => { clearInterval(i); clearInterval(li) }
  }, [])

  useEffect(() => {
    updateFlagIssues()
  }, [selectedModel, config, advanced, gpuStatus])

  const uptime = status.uptime_seconds 
    ? `${Math.floor(status.uptime_seconds / 60)}m ${Math.floor(status.uptime_seconds % 60)}s` 
    : '--'

  return (
    <div className="p-8 space-y-6 animate-in max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">Server Control</h1>
          <p className="text-text-muted mt-1">Configure and manage your SGLang local/remote server runtime</p>
        </div>
        
        <div className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 shadow-xs">
          <span className={cn("relative flex h-3 w-3", status.running ? "" : "opacity-60")}>
            {status.running && status.health === 'healthy' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            )}
            <span className={cn("relative inline-flex rounded-full h-3 w-3", 
              status.running ? (status.health === 'healthy' ? 'bg-success' : 'bg-warning') : 'bg-text-muted')}
            />
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">{status.running ? 'Server Online' : 'Server Offline'}</p>
            {status.running && (
              <p className="text-[10px] text-text-muted mt-1.5 font-medium">
                Uptime: {uptime} | {status.model_path.split('/').pop()}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex gap-2 border-b border-border pb-px">
            <button 
              onClick={() => setTab('config')} 
              className={cn(
                "px-4 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer",
                tab === 'config' ? "border-primary text-text font-bold" : "border-transparent text-text-muted hover:text-text"
              )}
            >
              Configuration
            </button>
            <button 
              onClick={() => setTab('logs')} 
              className={cn(
                "px-4 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer",
                tab === 'logs' ? "border-primary text-text font-bold" : "border-transparent text-text-muted hover:text-text"
              )}
            >
              Server Logs
            </button>
            <button 
              onClick={() => setTab('gpu')} 
              className={cn(
                "px-4 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer",
                tab === 'gpu' ? "border-primary text-text font-bold" : "border-transparent text-text-muted hover:text-text"
              )}
            >
              GPU Status
            </button>
          </div>

          <div className="mt-4">
            {tab === 'config' && (
              <div className="space-y-6">
                <ServerPresets />
                <ServerConfigPanel />
              </div>
            )}
            {tab === 'logs' && <ServerLogViewer />}
            {tab === 'gpu' && <GPUStatusBar />}
          </div>
        </div>

        <div className="space-y-6">
          <VRAMAdvisor />
          <div className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold text-text text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" /> Active Model Diagnostics
            </h3>
            <ValidationPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
