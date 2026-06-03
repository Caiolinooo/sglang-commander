import { useState } from 'react'
import { searchModels, downloadModel, listLocalModels } from '../api/endpoints'
import type { HFModel } from '../types'

export default function ModelsPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HFModel[]>([])
  const [local, setLocal] = useState<Array<{ repo_id: string; size_bytes: number }>>([])
  const [searching, setSearching] = useState(false)
  const [downloading, setDownloading] = useState('')

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const resp = await searchModels(query, 30)
      setResults(resp.data.models || [])
    } catch {} finally { setSearching(false) }
  }

  const handleDownload = async (repoId: string) => {
    setDownloading(repoId)
    try { await downloadModel(repoId) } catch {}
    setDownloading('')
  }

  const handleRefresh = async () => {
    try {
      const resp = await listLocalModels()
      setLocal(resp.data || [])
    } catch {}
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Model Management</h1>

      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-4 py-2 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Search HuggingFace Hub (e.g., Gemma, Qwen, Llama)" />
        <button onClick={handleSearch} disabled={searching}
          className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg transition">
          {searching ? 'Searching...' : 'Search'}
        </button>
        <button onClick={handleRefresh}
          className="px-4 py-2 bg-surface-2 hover:bg-surface text-white rounded-lg transition">
          Local Models
        </button>
      </div>

      {results.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted border-b border-border">
                <th className="text-left px-4 py-3 font-medium">Model ID</th>
                <th className="text-right px-4 py-3 font-medium">Downloads</th>
                <th className="text-center px-4 py-3 font-medium">Task</th>
                <th className="text-center px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((m, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg/50">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{m.repo_id}</p>
                    <p className="text-text-muted text-xs">{(m as unknown as Record<string, unknown>).description?.toString().slice(0, 100) ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-text-muted">{m.downloads.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 bg-surface-2 rounded text-xs">{m.pipeline_tag || 'N/A'}</span></td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleDownload(m.repo_id)} disabled={downloading === m.repo_id}
                      className="px-3 py-1 bg-secondary hover:bg-secondary/80 disabled:opacity-50 text-white rounded text-xs transition">
                      {downloading === m.repo_id ? 'Downloading...' : 'Download'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {local.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <h3 className="px-4 py-3 font-medium border-b border-border">Local Models</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted border-b border-border"><th className="text-left px-4 py-2">Model</th><th className="text-right px-4 py-2">Size</th></tr>
            </thead>
            <tbody>
              {local.map((m, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="px-4 py-2 text-white">{m.repo_id}</td>
                  <td className="px-4 py-2 text-right text-text-muted">{(m.size_bytes / 1e9).toFixed(2)} GB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
