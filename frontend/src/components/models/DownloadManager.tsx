import { useModelsStore } from '../../stores'
import { HardDrive, RefreshCw, Folder } from 'lucide-react'
import { Button } from '../ui/Button'

export default function DownloadManager() {
  const { local, fetchLocal, gpuInfo } = useModelsStore()

  // Calculate stats
  const totalModels = local.length
  const totalSize = local.reduce((acc, curr) => acc + (curr.size_gb || 0), 0)

  return (
    <div className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="font-semibold text-text text-sm flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" /> Disk Storage & Scanned Dirs
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchLocal} className="text-xs font-bold text-primary">
          <RefreshCw className="h-3 w-3 mr-1" /> Scan Folders
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-surface-2/40 border border-border rounded-lg p-3">
          <span className="text-text-muted block mb-1">Local Models Scan</span>
          <strong className="text-sm font-bold text-text">{totalModels} Models Scanned</strong>
        </div>
        <div className="bg-surface-2/40 border border-border rounded-lg p-3">
          <span className="text-text-muted block mb-1">Total Disk Utilization</span>
          <strong className="text-sm font-bold text-text">{totalSize.toFixed(1)} GB</strong>
        </div>
      </div>

      {gpuInfo && (
        <div className="bg-surface-2/40 border border-border rounded-lg p-3 text-xs space-y-1">
          <span className="text-text-muted font-semibold">Active Hardware Information</span>
          <div className="font-mono text-[11px] text-text">
            {gpuInfo.name} | VRAM: {gpuInfo.free_gb.toFixed(1)} GB free / {gpuInfo.total_gb.toFixed(1)} GB total
          </div>
        </div>
      )}

      <div className="space-y-1">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1">Target Scanner Directories</span>
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-2/50 border border-border rounded-md text-xs font-mono text-text-muted">
          <Folder size={12} className="text-primary shrink-0" />
          <span className="truncate">~/.cache/huggingface/hub/</span>
        </div>
      </div>
    </div>
  )
}
