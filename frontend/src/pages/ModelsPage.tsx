import { useState, useEffect } from 'react'
import { useModelsStore } from '../stores'
import { Download, Play, Trash2, X, RefreshCw, Cpu } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/cn'
import { locateModel } from '../api/endpoints'
import type { HFModel, LocalModel } from '../types'
import ModelCard from '../components/models/ModelCard'
import ModelSearchPanel from '../components/models/ModelSearchPanel'
import ModelDetailDrawer from '../components/models/ModelDetailDrawer'
import DownloadManager from '../components/models/DownloadManager'

const QUICK_MODELS = [
  { repo_id: 'meta-llama/Llama-3.2-3B-Instruct', label: 'Llama 3.2 3B', category: 'llm', vram: 6, desc: 'Fast, efficient instruction-tuned model' },
  { repo_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct', label: 'Llama 3.2 11B Vision', category: 'vision', vram: 20, desc: 'Multimodal vision-language model' },
  { repo_id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B', category: 'llm', vram: 14, desc: 'Strong multilingual instruction model' },
  { repo_id: 'Qwen/Qwen2-VL-7B-Instruct', label: 'Qwen2-VL 7B', category: 'vision', vram: 16, desc: 'Vision-language understanding' },
  { repo_id: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B v0.3', category: 'llm', vram: 14, desc: 'Mixture of Experts architecture' },
  { repo_id: 'microsoft/Phi-3-mini-4k-instruct', label: 'Phi-3 Mini', category: 'llm', vram: 4, desc: 'Compact yet powerful reasoning' },
  { repo_id: 'BAAI/bge-small-en-v1.5', label: 'BGE Small (Embed)', category: 'embedding', vram: 1, desc: 'Fast text embeddings' },
  { repo_id: 'Systran/faster-whisper-base.en', label: 'Whisper Base (STT)', category: 'stt', vram: 2, desc: 'Fast speech recognition' },
]

export default function ModelsPage() {
  const {
    results,
    local,
    searching,
    downloading,
    downloadProgress,
    tab,
    setTab,
    search,
    download,
    fetchLocal,
    deleteLocalModel,
    fetchGPU,
    gpuInfo
  } = useModelsStore()

  const [activeModel, setActiveModel] = useState<HFModel | null>(null)
  const [showLaunchDrawer, setShowLaunchDrawer] = useState(false)

  // Locate model state
  const [locateResult, setLocateResult] = useState<any | null>(null)
  const [showLocateDialog, setShowLocateDialog] = useState(false)

  // Delete model state
  const [deleteTarget, setDeleteTarget] = useState<LocalModel | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  useEffect(() => {
    fetchLocal()
    fetchGPU()
  }, [])

  useEffect(() => {
    if (tab === 'hub') {
      search()
    }
  }, [tab])

  const openLaunch = (model: HFModel | { repo_id: string; model_name?: string }) => {
    // Convert minimal local model signature to HFModel for launch configuration
    const launchData: HFModel = {
      repo_id: model.repo_id,
      model_name: model.model_name || model.repo_id.split('/').pop() || model.repo_id,
      author: model.repo_id.split('/')[0] || '',
      downloads: 0,
      likes: 0,
      tags: [],
      ...(model as any)
    }
    setActiveModel(launchData)
    setShowLaunchDrawer(true)
  }

  const handleLocate = async (repoId: string) => {
    try {
      const resp = await locateModel(repoId)
      setLocateResult(resp.data)
      setShowLocateDialog(true)
    } catch {
      // toast error
    }
  }

  const handleDeleteTrigger = (model: LocalModel) => {
    setDeleteTarget(model)
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await deleteLocalModel(deleteTarget.repo_id)
    setShowDeleteDialog(false)
    setDeleteTarget(null)
  }

  return (
    <div className="p-8 space-y-6 animate-in max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">Models Hub</h1>
          <p className="text-text-muted mt-1">Discover HuggingFace models, scan local storage, and spin up runtimes</p>
        </div>
        {gpuInfo && (
          <div className="text-xs text-text-muted bg-surface border border-border px-3.5 py-2.5 rounded-xl shadow-xs shrink-0 font-medium">
            <Cpu size={12} className="inline mr-1 text-primary animate-pulse" />
            {gpuInfo.name} | VRAM: {gpuInfo.free_gb.toFixed(1)}GB free
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex gap-2 border-b border-border pb-px">
            {['quick', 'hub', 'local'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 transition-colors capitalize cursor-pointer",
                  tab === t ? "border-primary text-text font-bold" : "border-transparent text-text-muted hover:text-text"
                )}
              >
                {t === 'quick' ? 'Presets' : t === 'hub' ? 'HF Hub search' : 'local models'}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === 'quick' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {QUICK_MODELS.map(m => {
                  const localData = local.find(l => l.repo_id === m.repo_id)
                  const isDownloaded = !!localData
                  return (
                    <div key={m.repo_id} className="border border-border rounded-xl bg-surface p-4 flex flex-col justify-between hover:border-border-hover transition-all">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-sm font-bold text-text truncate">{m.label}</h4>
                          {isDownloaded ? (
                            <Badge variant="success" className="text-[9px] py-0 tracking-wide uppercase">Downloaded</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] py-0 tracking-wide uppercase text-text-muted">Remote</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-text-muted font-mono truncate">{m.repo_id}</p>
                        <p className="text-xs text-text-muted leading-relaxed line-clamp-2">{m.desc}</p>
                        <div className="flex gap-2 text-[10px] text-text-muted font-semibold mt-1">
                          <span>Est. VRAM: {m.vram} GB</span>
                          <span>•</span>
                          <span className="capitalize">{m.category}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-4 border-t border-border/40 mt-4">
                        <Button size="sm" onClick={() => openLaunch(m)} className="flex-1 text-xs gap-1.5 h-8">
                          <Play size={12} /> Launch
                        </Button>
                        {!isDownloaded && (downloading === m.repo_id && downloadProgress ? (
                          <div className="flex-1 flex flex-col gap-0.5">
                            <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${Math.min(downloadProgress.progress_pct, 100)}%` }} />
                            </div>
                            <span className="text-[10px] text-text-muted text-right">{downloadProgress.progress_pct.toFixed(0)}%</span>
                          </div>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => download(m.repo_id)} disabled={downloading === m.repo_id} className="h-8 px-2">
                            {downloading === m.repo_id ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {tab === 'hub' && (
              <div className="space-y-4">
                <ModelSearchPanel />
                {searching ? (
                  <div className="text-center py-12 text-text-muted animate-pulse">Searching HuggingFace...</div>
                ) : results.length === 0 ? (
                  <div className="text-center py-12 text-text-muted">Enter a search query to search models on HuggingFace.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {results.map(m => {
                      const localData = local.find(l => l.repo_id === m.repo_id)
                      return (
                        <ModelCard
                          key={m.repo_id}
                          model={m}
                          isLocal={!!localData}
                          localData={localData}
                          onLaunch={() => openLaunch(m)}
                          onLocate={() => handleLocate(m.repo_id)}
                          onDownload={() => download(m.repo_id)}
                          downloading={downloading === m.repo_id}
                          progress={downloading === m.repo_id ? downloadProgress : null}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'local' && (
              <div className="space-y-4">
                {local.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-sm font-semibold text-text">No local models found</p>
                      <p className="text-xs text-text-muted mt-1 max-w-sm mb-4">Launch downloads from presets or the HF Hub search to get started.</p>
                      <Button size="sm" onClick={() => setTab('hub')}>Go to HF Hub Search</Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {local.map(m => (
                      <ModelCard
                        key={m.repo_id}
                        model={m}
                        isLocal={true}
                        localData={m}
                        onLaunch={() => openLaunch(m)}
                        onLocate={() => handleLocate(m.repo_id)}
                        onDownload={() => {}}
                        onDelete={() => handleDeleteTrigger(m)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <DownloadManager />
        </div>
      </div>

      {/* Model Detail Drawer for Deploy configurations */}
      <ModelDetailDrawer 
        model={activeModel}
        open={showLaunchDrawer}
        onClose={() => { setShowLaunchDrawer(false); setActiveModel(null) }}
      />

      {/* Locate Dialog */}
      {showLocateDialog && locateResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowLocateDialog(false)}>
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
              <h3 className="text-sm font-bold text-text">Model Storage Location</h3>
              <button onClick={() => setShowLocateDialog(false)} className="text-text-muted hover:text-text"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="bg-surface-2/65 rounded-lg p-3 border border-border">
                <span className="text-[10px] text-text-muted block mb-1">Local path</span>
                <span className="font-mono text-text break-all">{locateResult.local_path}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-surface-2/65 rounded-lg p-2.5 text-center">
                  <strong className="text-sm text-text block">{locateResult.size_gb}</strong>
                  <span className="text-[9px] text-text-muted uppercase font-semibold">GB size</span>
                </div>
                <div className="bg-surface-2/65 rounded-lg p-2.5 text-center">
                  <strong className="text-sm text-text block uppercase">{locateResult.format}</strong>
                  <span className="text-[9px] text-text-muted uppercase font-semibold">Format</span>
                </div>
                <div className="bg-surface-2/65 rounded-lg p-2.5 text-center">
                  <strong className="text-sm text-text block">{locateResult.files?.length || 0}</strong>
                  <span className="text-[9px] text-text-muted uppercase font-semibold">Files</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteDialog(false)}>
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md p-6 animate-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center text-danger">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">Permanently Delete Model?</h3>
                <p className="text-xs text-text-muted truncate mt-0.5">{deleteTarget.repo_id}</p>
              </div>
            </div>
            <p className="text-xs text-text-muted leading-relaxed mb-5">
              This will remove <strong>{deleteTarget.size_gb} GB</strong> of model files from your disk. You will need to re-download the model if you want to use it again.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleDeleteConfirm} className="flex-1 text-xs">
                Confirm Delete
              </Button>
              <Button variant="secondary" onClick={() => setShowDeleteDialog(false)} className="flex-1 text-xs">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
