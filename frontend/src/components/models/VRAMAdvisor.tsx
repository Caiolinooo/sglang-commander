import { useModelsStore } from '../../stores'
import { Cpu, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'

interface VRAMAdvisorProps {
  paramsBillions: number
  quantization?: string
  contextLength?: number
}

function dtypeBytes(q: string): number {
  const ql = q.toLowerCase()
  if (['awq', 'gptq', 'int4'].some(x => ql.includes(x))) return 0.5
  if (ql.includes('fp8') || ql.includes('int8')) return 1
  if (ql.includes('q2') || ql.includes('iq2')) return 0.25
  if (ql.includes('q3') || ql.includes('iq3')) return 0.375
  if (ql.includes('q4') || ql.includes('iq4')) return 0.5
  if (ql.includes('q5') || ql.includes('iq5')) return 0.625
  if (ql.includes('q6')) return 0.75
  if (ql.includes('q8')) return 1
  return 2
}

export default function VRAMAdvisor({ paramsBillions, quantization = 'auto', contextLength = 4096 }: VRAMAdvisorProps) {
  const { gpuInfo } = useModelsStore()
  if (!gpuInfo) return null

  const bpp = dtypeBytes(quantization)
  const modelWeightsGb = paramsBillions * bpp
  const kvCacheGb = 2.0 * (contextLength / 4096) * (paramsBillions / 7)
  const overheadGb = 1.5
  const totalRequired = modelWeightsGb + kvCacheGb + overheadGb
  const fits = totalRequired <= gpuInfo.free_gb * 0.95

  return (
    <Card className={cn("border border-dashed shadow-xs", fits ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text flex items-center gap-1.5">
            <Cpu size={14} className="text-primary" /> VRAM Advisor
          </span>
          <Badge variant={fits ? "success" : "danger"} className="text-[10px]">
            {fits ? "Fits" : "OOM Risk"}
          </Badge>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Model Weights ({quantization || 'fp16'}):</span>
            <strong className="text-text">{modelWeightsGb.toFixed(1)} GB</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">KV Cache ({contextLength.toLocaleString()} ctx):</span>
            <strong className="text-text">{kvCacheGb.toFixed(1)} GB</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Framework Overhead:</span>
            <strong className="text-text">{overheadGb.toFixed(1)} GB</strong>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-bold">
            <span className="text-text">Total Estimated VRAM:</span>
            <span className={fits ? "text-success" : "text-danger"}>{totalRequired.toFixed(1)} GB</span>
          </div>
        </div>

        <div className="text-[10px] text-text-muted flex items-start gap-1 leading-normal">
          {fits ? (
            <>
              <CheckCircle2 size={12} className="text-success shrink-0 mt-0.5" />
              <span>Model is highly likely to fit on {gpuInfo.name} ({gpuInfo.free_gb.toFixed(1)} GB free).</span>
            </>
          ) : (
            <>
              <AlertTriangle size={12} className="text-danger shrink-0 mt-0.5" />
              <span>Model might exceed available VRAM. Consider AWQ/FP8 or CPU offloading.</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
