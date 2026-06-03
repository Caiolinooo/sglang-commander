import { useState, useRef } from 'react'
import { runBenchmark, cancelBenchmark } from '../api/endpoints'
import type { BenchmarkResult } from '../types'

export default function BenchmarkPage() {
  const [config, setConfig] = useState({ host: '127.0.0.1', port: 30000, prompt: 'What is the capital of France?', max_tokens: 100, temperature: 0.7, num_runs: 10, concurrency: 1 })
  const [result, setResult] = useState<BenchmarkResult | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const update = (f: string, v: unknown) => setConfig(p => ({ ...p, [f]: v }))

  const handleRun = async () => {
    setRunning(true); setProgress(0); setResult(null)
    try { const r = await runBenchmark(config); setResult(r.data) } catch {}
    finally { setRunning(false); setProgress(100); if (pollRef.current) clearInterval(pollRef.current) }
  }

  const handleCancel = async () => { try { await cancelBenchmark() } catch {}; setRunning(false); if (pollRef.current) clearInterval(pollRef.current) }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Benchmark</h1>
          <p className="text-text-muted text-sm mt-0.5">Measure server latency and throughput</p>
        </div>
        {running && <span className="text-warning text-sm font-medium animate-pulse">{'\u25a0\u25a0\u25a0'} Running {Math.round(progress)}%</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[['Host', 'host'], ['Port', 'port'], ['Runs', 'num_runs'], ['Concurrency', 'concurrency']].map(([l, f]) => (
          <div key={f} className="glass rounded-xl p-4">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{l}</label>
            <input type={f === 'host' ? 'text' : 'number'} value={config[f as keyof typeof config] as string | number}
              onChange={e => update(f, f === 'host' ? e.target.value : Number(e.target.value))}
              className="w-full mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-4">
        <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 block">Prompt</label>
        <textarea value={config.prompt} onChange={e => update('prompt', e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
      </div>

      <div className="flex gap-3">
        <button onClick={handleRun} disabled={running}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary-hover text-white text-sm font-medium transition-all shadow-lg shadow-primary/20 disabled:opacity-50">{'\u25b6'} Run Benchmark</button>
        <button onClick={handleCancel} disabled={!running}
          className="px-5 py-2.5 rounded-xl glass hover:bg-surface-2 text-sm disabled:opacity-50">{'\u2715'} Cancel</button>
      </div>

      {running && <div className="w-full h-2 rounded-full bg-bg overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}

      {result?.summary && (
        <div className="glass rounded-2xl p-5 animate-fade-in">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Results</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              ['Avg Latency', `${result.summary.avg_latency_ms}ms`, '#a855f7'],
              ['P50', `${result.summary.p50_latency_ms}ms`, '#6366f1'],
              ['P95', `${result.summary.p95_latency_ms}ms`, '#f43f5e'],
              ['P99', `${result.summary.p99_latency_ms}ms`, '#ef4444'],
              ['Min / Max', `${result.summary.min_latency_ms} / ${result.summary.max_latency_ms} ms`, '#22c55e'],
              ['Tokens/sec', String(result.summary.tokens_per_second), '#06b6d4'],
              ['Total Tokens', String(result.summary.total_tokens), '#eab308'],
              ['Total Time', `${result.summary.total_time_seconds}s`, '#f97316'],
            ].map(([l, v, c]) => (
              <div key={l} className="glass rounded-xl p-3">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">{l}</p>
                <p className="text-lg font-bold mt-1" style={{ color: c }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result?.runs && result.runs.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Per-Run Breakdown</h3>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-text-muted border-b border-border"><th className="text-left p-2">Run</th><th className="text-right p-2">Latency (ms)</th><th className="text-right p-2">Tokens</th></tr></thead>
              <tbody>{result.runs.map(r => <tr key={r.run} className="border-b border-border/40"><td className="p-2">{r.run}</td><td className="text-right p-2">{r.latency_ms}</td><td className="text-right p-2">{r.tokens_generated}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
