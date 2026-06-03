import { useState, useEffect } from 'react'
import { searchModels, downloadModel, listLocalModels, startServer } from '../api/endpoints'
import type { HFModel } from '../types'

const CATEGORIES = [
  { id: 'text-generation', label: 'LLM', icon: '\ud83e\udde0' },
  { id: 'image-text-to-text', label: 'Vision', icon: '\ud83d\udcf7' },
  { id: 'text-embedding', label: 'Embeddings', icon: '\ud83d\udd17' },
  { id: 'automatic-speech-recognition', label: 'STT', icon: '\ud83c\udfa4' },
  { id: 'text-to-speech', label: 'TTS', icon: '\ud83d\udd0a' },
  { id: '', label: 'All', icon: '\ud83d\udd0d' },
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
    <div key={id} className="glass rounded-xl p-4 hover:border-primary/50 transition-all duration-300 cursor-pointer group"
      onClick={() => setSelectedModel({ repo_id: id, model_name: extra.label || id, author: id.split('/')[0], downloads: extra.downloads || 0, likes: extra.likes || 0, pipeline_tag: extra.task, tags: [] } as HFModel)}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{id}</p>
          {extra.label && <p className="text-xs text-text-muted mt-0.5">{extra.label}</p>}
        </div>
        {extra.task && <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase font-semibold ml-2">{extra.task}</span>}
      </div>
      <div className="flex items-center gap-3 text-xs text-text-muted mb-3">
        {extra.downloads !== undefined && <span>{'\u2b07'} {extra.downloads.toLocaleString()}</span>}
        {extra.likes !== undefined && <span>{'\u2764'} {extra.likes}</span>}
        {extra.size !== undefined && <span>{'\ud83d\udcbe'} {fmtSize(extra.size)}</span>}
      </div>
      <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
        <button onClick={() => handleDownload(id)} disabled={downloading === id}
          className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
          {downloading === id ? 'Downloading...' : 'Download'}
        </button>
        <button onClick={() => handleDeploy(id)} disabled={deploying}
          className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-success/10 text-success hover:bg-success/20 transition disabled:opacity-50">
          Deploy
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Model Hub</h1>
          <p className="text-text-muted text-sm mt-0.5">Browse, download, and deploy models</p>
        </div>
        <div className="flex items-center gap-2">
          {deployMsg && (
            <div className="glass rounded-xl px-4 py-2 text-sm animate-fade-in">
              <span className={deployMsg.includes('Failed') ? 'text-danger' : 'text-success'}>{deployMsg}</span>
            </div>
          )}
          <button onClick={handleRefresh}
            className="px-4 py-2 rounded-xl glass hover:bg-surface-2 text-sm transition">
            {'\ud83d\udd04'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['quick', 'hub', 'local'].map(t => (
          <button key={t} onClick={() => setTab(t as typeof tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
              tab === t ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'glass hover:bg-surface-2'
            }`}>
            {t === 'quick' ? '\u26a1 Quick Deploy' : t === 'hub' ? '\ud83d\udd0d HuggingFace' : '\ud83d\uddc2\ufe0f Local'}
          </button>
        ))}
      </div>

      {tab === 'quick' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Recommended Models</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {QUICK_MODELS.map(m => modelCard(m.repo_id, { label: m.label, task: m.category, size: m.vram * 1e9 * 2 }))}
            </div>
          </div>
        </div>
      )}

      {tab === 'hub' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">{'\ud83d\udd0d'}</span>
              <input value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition"
                placeholder="Search HuggingFace Hub..." />
            </div>
            <button onClick={handleSearch} disabled={searching}
              className="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-primary/20">
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  category === c.id ? 'bg-secondary/20 text-secondary' : 'glass hover:bg-surface-2'
                }`}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(m => modelCard(m.repo_id, {
                label: m.model_name, downloads: m.downloads, likes: m.likes, task: m.pipeline_tag
              }))}
            </div>
          ) : searching ? (
            <div className="grid grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <div key={i} className="shimmer h-32" />)}
            </div>
          ) : (
            <div className="glass rounded-2xl p-12 text-center">
              <p className="text-4xl mb-3 opacity-40">{'\ud83d\udd0d'}</p>
              <p className="text-text-muted">Search models from HuggingFace Hub</p>
            </div>
          )}
        </div>
      )}

      {tab === 'local' && (
        <div>
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Downloaded Models</h3>
          {local.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {local.map(m => modelCard(m.repo_id, { size: m.size_bytes }))}
            </div>
          ) : (
            <div className="glass rounded-2xl p-12 text-center">
              <p className="text-4xl mb-3 opacity-40">{'\ud83d\udc04'}</p>
              <p className="text-text-muted">No downloaded models yet</p>
              <p className="text-xs text-text-muted mt-1">Use Quick Deploy or search HuggingFace</p>
            </div>
          )}
        </div>
      )}

      {selectedModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedModel(null)}>
          <div className="glass rounded-2xl p-6 max-w-md w-full mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold">{selectedModel.repo_id}</h3>
                <p className="text-xs text-text-muted mt-0.5">{selectedModel.model_name || selectedModel.repo_id}</p>
              </div>
              <button onClick={() => setSelectedModel(null)} className="text-text-muted hover:text-text text-lg">{'\u2715'}</button>
            </div>
            <div className="flex gap-2 mb-4 text-xs text-text-muted">
              <span>{'\u2b07'} {selectedModel.downloads.toLocaleString()} downloads</span>
              <span>{'\u2764'} {selectedModel.likes}</span>
              {selectedModel.pipeline_tag && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">{selectedModel.pipeline_tag}</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { handleDownload(selectedModel.repo_id); setSelectedModel(null) }}
                className="flex-1 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition">
                Download
              </button>
              <button onClick={() => { handleDeploy(selectedModel.repo_id); setSelectedModel(null) }}
                className="flex-1 px-4 py-2 rounded-xl bg-success text-white text-sm font-medium hover:bg-success/90 transition">
                Deploy Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
