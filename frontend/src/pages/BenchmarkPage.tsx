import { useState, useRef } from 'react'
import { runBenchmark, cancelBenchmark } from '../api/endpoints'
import type { BenchmarkResult } from '../types'
import { Activity, Play, Square, BarChart, List, Terminal, Hash, Clock, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

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
    <div className="p-8 space-y-6 animate-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">Benchmark</h1>
          <p className="text-text-muted mt-1">Measure server latency and throughput</p>
        </div>
        {running && (
          <div className="flex items-center gap-2 bg-warning/10 text-warning px-3 py-1.5 rounded-lg text-sm font-medium animate-pulse border border-warning/20">
            <Activity className="w-4 h-4" /> Running {Math.round(progress)}%
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <CardTitle>Configuration</CardTitle>
          </div>
          <CardDescription>Set the parameters for your load test</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[['Host', 'host'], ['Port', 'port'], ['Runs', 'num_runs'], ['Concurrency', 'concurrency']].map(([l, f]) => (
              <div key={f}>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">{l}</label>
                <Input 
                  type={f === 'host' ? 'text' : 'number'} 
                  value={config[f as keyof typeof config] as string | number}
                  onChange={e => update(f, f === 'host' ? e.target.value : Number(e.target.value))}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted mb-1.5 block">Prompt</label>
            <textarea 
              value={config.prompt} 
              onChange={e => update('prompt', e.target.value)} 
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none" 
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={handleRun} disabled={running} className="gap-2 w-full sm:w-auto">
              {running ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} 
              {running ? 'Running...' : 'Run Benchmark'}
            </Button>
            <Button variant="secondary" onClick={handleCancel} disabled={!running} className="gap-2 w-full sm:w-auto">
              <Square className="w-4 h-4" /> Cancel
            </Button>
          </div>

          {running && (
            <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden mt-4">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
        </CardContent>
      </Card>

      {result?.summary && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart className="w-5 h-5 text-primary" />
                <CardTitle>Results Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(
                  [
                    ['Avg Latency', `${result.summary.avg_latency_ms}ms`, 'text-purple-500', Clock],
                    ['P50', `${result.summary.p50_latency_ms}ms`, 'text-indigo-500', Activity],
                    ['P95', `${result.summary.p95_latency_ms}ms`, 'text-rose-500', Activity],
                    ['P99', `${result.summary.p99_latency_ms}ms`, 'text-red-500', Activity],
                    ['Min / Max', `${result.summary.min_latency_ms} / ${result.summary.max_latency_ms} ms`, 'text-green-500', Activity],
                    ['Tokens/sec', String(result.summary.tokens_per_second), 'text-cyan-500', Zap],
                    ['Total Tokens', String(result.summary.total_tokens), 'text-yellow-500', Hash],
                    ['Total Time', `${result.summary.total_time_seconds}s`, 'text-orange-500', Clock],
                  ] as Array<[string, string, string, React.ElementType]>
                ).map(([l, v, colorClass, Icon]) => (
                  <div key={l} className="bg-surface-2 rounded-xl p-4 border border-border">
                    <div className="flex items-center gap-1.5 mb-2 opacity-80">
                      <Icon className="w-3.5 h-3.5" />
                      <p className="text-[10px] text-text-muted uppercase font-semibold tracking-wider">{l}</p>
                    </div>
                    <p className={`text-xl font-bold ${colorClass}`}>{v}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {result?.runs && result.runs.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <List className="w-5 h-5 text-primary" />
                  <CardTitle>Per-Run Breakdown</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-2">
                  <table className="w-full text-sm">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr className="text-text-muted border-b border-border">
                        <th className="text-left py-2.5 px-4 font-medium">Run</th>
                        <th className="text-right py-2.5 px-4 font-medium">Latency (ms)</th>
                        <th className="text-right py-2.5 px-4 font-medium">Tokens</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {result.runs.map(r => (
                        <tr key={r.run} className="hover:bg-surface transition-colors">
                          <td className="py-2 px-4 font-mono">{r.run}</td>
                          <td className="text-right py-2 px-4 font-mono">{r.latency_ms}</td>
                          <td className="text-right py-2 px-4 font-mono">{r.tokens_generated}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
