import type { HFModel, LocalModel } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Download, Heart, Cpu, HardDrive, Database, Play, Trash2, FolderOpen, AlertTriangle, Check, RefreshCw } from 'lucide-react'

interface ModelCardProps {
  model: HFModel | { repo_id: string; model_name?: string }
  isLocal?: boolean
  localData?: LocalModel
  onLaunch: () => void
  onLocate: () => void
  onDownload: () => void
  onDelete?: () => void
  downloading?: boolean
}

export default function ModelCard({
  model,
  isLocal = false,
  localData,
  onLaunch,
  onLocate,
  onDownload,
  onDelete,
  downloading = false
}: ModelCardProps) {
  const repoId = model.repo_id
  const name = model.model_name || repoId.split('/').pop() || repoId
  const isHF = 'downloads' in model
  const m = isHF ? model as HFModel : undefined
  const l = localData

  const fits = m?.fits_in_gpu ?? l?.fits_in_gpu
  const vram = m?.vram_estimate_gb ?? l?.vram_estimate_gb

  const fmtNum = (n: number) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="border border-border rounded-xl bg-surface hover:border-border-hover hover:shadow-md transition-all p-4 flex flex-col justify-between space-y-3">
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-text truncate" title={name}>{name}</h4>
            <p className="text-xs text-text-muted truncate font-mono">{repoId}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {m?.format && m.format !== 'unknown' && (
              <Badge variant="outline" className="text-[9px] py-0 uppercase border-success/30 bg-success/5 text-success">
                {m.format}
              </Badge>
            )}
            {m?.quantization && (
              <Badge variant="outline" className="text-[9px] py-0 uppercase border-primary/30 bg-primary/5 text-primary">
                {m.quantization}
              </Badge>
            )}
            {m?.is_multimodal && (
              <Badge variant="outline" className="text-[9px] py-0 border-info/30 bg-info/5 text-info">
                Vision
              </Badge>
            )}
            {(m?.is_moe || l?.is_moe) && (
              <Badge variant="outline" className="text-[9px] py-0 border-warning/30 bg-warning/5 text-warning">
                MoE
              </Badge>
            )}
          </div>
        </div>

        {m?.description && <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">{m.description}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-text-muted">
          {isHF && m && (
            <span className="flex items-center gap-1">
              <Download size={11} /> {fmtNum(m.downloads)}
            </span>
          )}
          {isHF && m && (
            <span className="flex items-center gap-1">
              <Heart size={11} /> {fmtNum(m.likes)}
            </span>
          )}
          {(m?.params_billions || l?.params_billions) && (
            <span className="flex items-center gap-1">
              <Cpu size={11} /> {m?.params_billions || l?.params_billions}B
            </span>
          )}
          {vram && vram > 0 && (
            <span className="flex items-center gap-1">
              <HardDrive size={11} /> {vram}GB
            </span>
          )}
          {l && (
            <span className="flex items-center gap-1">
              <Database size={11} /> {l.size_gb}GB
            </span>
          )}
        </div>

        {vram !== undefined && vram > 0 && (
          <div className="pt-0.5">
            {fits ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/20">
                <Check size={10} /> Fits GPU ({vram}GB VRAM est.)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/20">
                <AlertTriangle size={10} /> Exceeds GPU ({vram}GB VRAM est.)
              </span>
            )}
          </div>
        )}

        {l?.warnings && l.warnings.length > 0 && (
          <div className="text-[10px] text-warning bg-warning/10 rounded px-2.5 py-1 leading-normal">
            {l.warnings[0]}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-border/40">
        <Button size="sm" onClick={onLaunch} className="flex-1 gap-1.5 text-xs h-8">
          <Play size={12} /> Launch
        </Button>
        <Button size="sm" variant="secondary" onClick={onLocate} className="h-8 px-2" title="Locate folder">
          <FolderOpen size={12} />
        </Button>
        {isLocal && onDelete ? (
          <Button size="sm" variant="danger" onClick={onDelete} className="h-8 px-2" title="Delete files">
            <Trash2 size={12} />
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onDownload} disabled={downloading} className="h-8 px-2" title="Download model">
            {downloading ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
          </Button>
        )}
      </div>
    </div>
  )
}
