import { useState, useRef } from 'react'
import { runBenchmark, cancelBenchmark } from '../api/endpoints'
import type { BenchmarkResult } from '../types'

export default function BenchmarkPage() {
  const [config, setConfig] = useState({
    host: '127.0.0.1', port: 30000, prompt: 'What is the capital of France?',
    max_tokens: 100, temperature: 0.7, num_runs: 10, concurrency: 1,
  })
  const [result, setResult] = useState<BenchmarkResult | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const update = (field: string, value: unknown) => setConfig(p => ({ ...p, [field]: value }))

  const handleRun = async () => {
    setRunning(true)
    setProgress(0)
    setResult(null)
    try {
      const r = await runBenchmark(config)
      setResult(r.data)
    } catch (e) {
      console.error(e)
    } finally {
      setRunning(false)
      setProgress(100)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }

  const handleCancel = async () => {
    try { await cancelBenchmark() } catch {}
    setRunning(false)
    if (pollRef.current) clearInterval(pollRef.current)
  }

  const bar = (pct: number) => {
    const w = Math.min(pct, 100)
    return (
      <div className="w-full bg-bg rounded-full h-2 mt-1">
        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${w}%` }} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Benchmark</h1>
        {running && <span className="text-yellow-400 animate-pulse text-sm">Running... {Math.round(progress)}%</span>}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Host</label>
          <input value={config.host} onChange={e => update('host', e.target.value)}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Port</label>
          <input type="number" value={config.port} onChange={e => update('port', Number(e.target.value))}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Runs</label>
          <input type="number" min={1} max={100} value={config.num_runs} onChange={e => update('num_runs', Number(e.target.value))}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <label className="text-sm text-text-muted block mb-1">Concurrency</label>
          <input type="number" min={1} max={10} value={config.concurrency} onChange={e => update('concurrency', Number(e.target.value))}
            className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
        </div>
      </div>

      <div className="bg-surface rounded-xl p-4 border border-border">
        <label className="text-sm text-text-muted block mb-1">Prompt</label>
        <textarea value={config.prompt} onChange={e => update('prompt', e.target.value)} rows={2}
          className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
      </div>

      <div className="flex gap-3">
        <button onClick={handleRun} disabled={running}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50">▶ Run Benchmark</button>
        <button onClick={handleCancel} disabled={!running}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">✕ Cancel</button>
      </div>

      {running && bar(progress)}

      {result?.summary && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="font-medium mb-3">Results</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div><span className="text-text-muted">Avg Latency</span><p className="text-lg font-bold">{result.summary.avg_latency_ms}ms</p></div>
            <div><span className="text-text-muted">P50</span><p className="text-lg font-bold">{result.summary.p50_latency_ms}ms</p></div>
            <div><span className="text-text-muted">P95</span><p className="text-lg font-bold">{result.summary.p95_latency_ms}ms</p></div>
            <div><span className="text-text-muted">P99</span><p className="text-lg font-bold">{result.summary.p99_latency_ms}ms</p></div>
            <div><span className="text-text-muted">Min / Max</span><p className="text-lg font-bold">{result.summary.min_latency_ms} / {result.summary.max_latency_ms} ms</p></div>
            <div><span className="text-text-muted">Tokens/sec</span><p className="text-lg font-bold">{result.summary.tokens_per_second}</p></div>
            <div><span className="text-text-muted">Total Tokens</span><p className="text-lg font-bold">{result.summary.total_tokens}</p></div>
            <div><span className="text-text-muted">Total Time</span><p className="text-lg font-bold">{result.summary.total_time_seconds}s</p></div>
          </div>
        </div>
      )}

      {result?.runs && result.runs.length > 0 && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="font-medium mb-3">Per-Run Breakdown</h3>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-text-muted border-b border-border"><th className="text-left p-2">Run</th><th className="text-right p-2">Latency (ms)</th><th className="text-right p-2">Tokens</th></tr></thead>
              <tbody>
                {result.runs.map((r) => (
                  <tr key={r.run} className="border-b border-border/50"><td className="p-2">{r.run}</td><td className="text-right p-2">{r.latency_ms}</td><td className="text-right p-2">{r.tokens_generated}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
