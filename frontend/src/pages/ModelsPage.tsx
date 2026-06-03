import { useState, useEffect } from 'react'
import { searchModels, downloadModel, listLocalModels, startServer } from '../api/endpoints'
import type { HFModel } from '../types'
import { Brain, Camera, Link as LinkIcon, Mic, Volume2, Search, Zap, HardDrive, Download, Heart, RefreshCw, Inbox, Database, Check } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/Button'

const CATEGORIES = [
  { id: 'text-generation', label: 'LLM', icon: Brain },
  { id: 'image-text-to-text', label: 'Vision', icon: Camera },
  { id: 'text-embedding', label: 'Embeddings', icon: LinkIcon },
  { id: 'automatic-speech-recognition', label: 'STT', icon: Mic },
  { id: 'text-to-speech', label: 'TTS', icon: Volume2 },
  { id: '', label: 'All', icon: Search },
]

const QUICK_MODELS = [
  { repo_id: 'meta-llama/Llama-3.2-3B-Instruct', label: 'Llama 3.2 3B', category: 'llm', vram: 6 },
  { repo_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct', label: 'Llama 3.2 11B Vision', category: 'vision', vram: 20 },
  { repo_id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B', category: 'llm', vram: 14 },
  { repo_id: 'Qwen/Qwen2-VL-7B-Instruct', label: 'Qwen2-VL 7B', category: 'vision', vram: 16 },
  { repo_id: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B v0.3', category: 'llm', vram: 14 },
  { repo_id: 'microsoft/Phi-3-mini-4k-instruct', label: 'Phi-3 Mini', category: 'llm', vram: 4 },
  { repo_id: 'BAAI/bge-small-en-v1.5', label: 'BGE Small (Embed)', category: 'embedding', vram: 1 },
  { repo_id: 'sentence-transformers/all-MiniLM-L6-v2', label: 'MiniLM (Embed)', category: 'embedding', vram: 1 },
  { repo_id: 'Systran/faster-whisper-base.en', label: 'Whisper Base (STT)', category: 'stt', vram: 2 },
  { repo_id: 'suno/bark', label: 'Bark (TTS)', category: 'tts', vram: 4 },
]

export default function ModelsPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HFModel[]>([])
  const [local, setLocal] = useState<Array<{ repo_id: string; size_bytes: number }>>([])
  const [searching, setSearching] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [category, setCategory] = useState('')
  const [tab, setTab] = useState<'hub' | 'local' | 'quick'>('quick')
  const [selectedModel, setSelectedModel] = useState<HFModel | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [deployMsg, setDeployMsg] = useState('')

  useEffect(() => { handleRefresh() }, [])
  useEffect(() => { if (category && query) handleSearch() }, [category])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setTab('hub')
    try {
      const resp = await searchModels(query, 50, category || undefined)
      setResults(resp.data.models || [])
    } catch {} finally { setSearching(false) }
  }

  const handleDownload = async (repoId: string) => {
    setDownloading(repoId)
    try { await downloadModel(repoId); alert(`Download started: ${repoId}`) } catch (e) { console.error(e) }
    setDownloading('')
    setTimeout(handleRefresh, 2000)
  }

  const handleRefresh = async () => {
    try {
      const [l] = await Promise.all([listLocalModels().catch(() => ({ data: [] }))])
      setLocal((l as { data: Array<{ repo_id: string; size_bytes: number }> }).data || [])
    } catch {}
  }

  const handleDeploy = async (repoId: string) => {
    setDeploying(true)
    setDeployMsg(`Deploying ${repoId}...`)
    try {
      await startServer({
        model_path: repoId, host: '127.0.0.1', port: 30000,
        tensor_parallel_size: 1, trust_remote_code: true,
      })
      setDeployMsg(`${repoId} deployed!`)
      setTimeout(() => setDeployMsg(''), 3000)
    } catch (e) {
      setDeployMsg(`Failed: ${e}`)
    } finally { setDeploying(false) }
  }

  const fmtSize = (b: number) => {
    const gb = b / 1e9
    if (gb > 100) return `${(gb / 1e3).toFixed(1)} TB`
    return `${gb.toFixed(1)} GB`
  }

  const modelCard = (id: string, extra: { label?: string; downloads?: number; likes?: number; task?: string; size?: number }) => (
    <Card key={id} className="hover:border-primary/50 transition-all duration-300 cursor-pointer group"
      onClick={() => setSelectedModel({ repo_id: id, model_name: extra.label || id, author: id.split('/')[0], downloads: extra.downloads || 0, likes: extra.likes || 0, pipeline_tag: extra.task, tags: [] } as HFModel)}>
      <CardContent className="p-5 flex flex-col h-full">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-2">
            <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors text-text">{id}</p>
            {extra.label && <p className="text-xs text-text-muted mt-1">{extra.label}</p>}
          </div>
          {extra.task && <Badge variant="outline" className="shrink-0 text-[10px] uppercase">{extra.task}</Badge>}
        </div>
        
        <div className="flex items-center gap-4 text-xs text-text-muted mb-5 mt-auto pt-2">
          {extra.downloads !== undefined && <span className="flex items-center gap-1"><Download size={12} /> {extra.downloads.toLocaleString()}</span>}
          {extra.likes !== undefined && <span className="flex items-center gap-1"><Heart size={12} /> {extra.likes}</span>}
          {extra.size !== undefined && <span className="flex items-center gap-1"><HardDrive size={12} /> {fmtSize(extra.size)}</span>}
        </div>
        
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="secondary" onClick={() => handleDownload(id)} disabled={downloading === id} className="flex-1 text-xs h-8">
            {downloading === id ? 'Downloading...' : 'Download'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleDeploy(id)} disabled={deploying} className="flex-1 text-xs h-8 border-success/30 text-success hover:bg-success/10">
            Deploy
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="p-8 space-y-6 animate-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">Model Hub</h1>
          <p className="text-text-muted mt-1">Browse, download, and deploy models</p>
        </div>
        <div className="flex items-center gap-3">
          {deployMsg && (
            <div className="bg-surface border border-border rounded-lg px-4 py-2 text-sm shadow-sm animate-fade-in flex items-center gap-2">
              {deployMsg.includes('Failed') ? <span className="text-danger">{deployMsg}</span> : <><Check className="w-4 h-4 text-success" /> <span className="text-success font-medium">{deployMsg}</span></>}
            </div>
          )}
          <Button variant="outline" size="icon" onClick={handleRefresh} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant={tab === 'quick' ? 'primary' : 'secondary'} onClick={() => setTab('quick')} className="gap-2">
          <Zap className="w-4 h-4" /> Quick Deploy
        </Button>
        <Button variant={tab === 'hub' ? 'primary' : 'secondary'} onClick={() => setTab('hub')} className="gap-2">
          <Database className="w-4 h-4" /> HuggingFace
        </Button>
        <Button variant={tab === 'local' ? 'primary' : 'secondary'} onClick={() => setTab('local')} className="gap-2">
          <HardDrive className="w-4 h-4" /> Local
        </Button>
      </div>

      {tab === 'quick' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Recommended Models</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {QUICK_MODELS.map(m => modelCard(m.repo_id, { label: m.label, task: m.category, size: m.vram * 1e9 * 2 }))}
            </div>
          </div>
        </div>
      )}

      {tab === 'hub' && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input 
                icon={<Search className="w-4 h-4" />}
                value={query} 
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search HuggingFace Hub (e.g. llama, mistral, whisper)..." 
                className="h-11"
              />
            </div>
            <Button size="lg" onClick={handleSearch} disabled={searching} className="px-8">
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(c => {
              const Icon = c.icon
              return (
                <Button 
                  key={c.id} 
                  variant={category === c.id ? 'primary' : 'outline'} 
                  size="sm" 
                  onClick={() => setCategory(c.id)}
                  className={cn("gap-2 text-xs h-8", category === c.id ? "" : "border-border")}
                >
                  <Icon className="w-3 h-3" /> {c.label}
                </Button>
              )
            })}
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map(m => modelCard(m.repo_id, {
                label: m.model_name, downloads: m.downloads, likes: m.likes, task: m.pipeline_tag
              }))}
            </div>
          ) : searching ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="bg-surface-2 animate-pulse h-40 rounded-xl" />)}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-16 w-16 rounded-full bg-surface-2 flex items-center justify-center mb-4">
                  <Search className="h-8 w-8 text-text-muted opacity-50" />
                </div>
                <h3 className="text-base font-semibold text-text">Search HuggingFace Hub</h3>
                <p className="text-sm text-text-muted mt-1 max-w-sm">Enter a model name or keyword above to discover models from the HuggingFace community.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'local' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Downloaded Models</h3>
          {local.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {local.map(m => modelCard(m.repo_id, { size: m.size_bytes }))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-16 w-16 rounded-full bg-surface-2 flex items-center justify-center mb-4">
                  <Inbox className="h-8 w-8 text-text-muted opacity-50" />
                </div>
                <h3 className="text-base font-semibold text-text">No downloaded models yet</h3>
                <p className="text-sm text-text-muted mt-1 max-w-sm">Use Quick Deploy or search HuggingFace to download models for offline use.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {selectedModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm p-4 animate-in" onClick={() => setSelectedModel(null)}>
          <Card className="max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-text">{selectedModel.repo_id}</h3>
                  <p className="text-sm text-text-muted mt-1">{selectedModel.model_name || selectedModel.repo_id}</p>
                </div>
              </div>
              <div className="flex gap-4 mb-6 text-sm text-text-muted bg-surface-2 p-3 rounded-lg">
                <span className="flex items-center gap-1.5"><Download size={14} /> {selectedModel.downloads.toLocaleString()}</span>
                <span className="flex items-center gap-1.5"><Heart size={14} /> {selectedModel.likes}</span>
                {selectedModel.pipeline_tag && <Badge variant="outline" className="ml-auto">{selectedModel.pipeline_tag}</Badge>}
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => { handleDownload(selectedModel.repo_id); setSelectedModel(null) }} className="flex-1">
                  Download
                </Button>
                <Button onClick={() => { handleDeploy(selectedModel.repo_id); setSelectedModel(null) }} className="flex-1 bg-success hover:bg-success/90 text-white">
                  Deploy Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
