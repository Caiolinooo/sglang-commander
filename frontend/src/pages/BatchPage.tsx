import { useState, useRef, useEffect } from 'react'
import { useServerStore } from '../stores'
import { FileSpreadsheet, Upload, Play, RefreshCw, Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Slider } from '../components/ui/Slider'
import { Card, CardContent } from '../components/ui/Card'
import { toast } from '../components/ui/Toast'
import { cn } from '../components/ui/cn'

interface BatchItem {
  id: number
  variables: Record<string, string>
  prompt: string
  response: string
  status: 'pending' | 'running' | 'success' | 'error'
  tokens?: number
  latencyMs?: number
}

export default function BatchPage() {
  const { status, fetchStatus } = useServerStore()
  
  const [fileData, setFileData] = useState<Record<string, string>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  
  // Prompt settings
  const [promptTemplate, setPromptTemplate] = useState('Translate this text into Spanish:\n"{{text}}"\nTranslation:')
  const [extractedVars, setExtractedVars] = useState<string[]>(['text'])
  const [varMappings, setVarMappings] = useState<Record<string, string>>({ text: '' })
  
  // Runtimes config
  const [parallelism, setParallelism] = useState(8)
  const [temperature, setTemperature] = useState(0.7)
  
  // Batch Execution State
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchStatus()
  }, [])

  // Auto-extract variables from template e.g. {{name}}, {{topic}}
  useEffect(() => {
    const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g
    const found: string[] = []
    let match
    while ((match = regex.exec(promptTemplate)) !== null) {
      if (!found.includes(match[1])) {
        found.push(match[1])
      }
    }
    setExtractedVars(found)
    
    // Maintain mappings
    setVarMappings(prev => {
      const next: Record<string, string> = {}
      found.forEach(v => {
        next[v] = prev[v] || headers[0] || ''
      })
      return next
    })
  }, [promptTemplate, headers])

  // Parse CSV or JSONL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      try {
        if (file.name.endsWith('.jsonl')) {
          const parsed = text.split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line))
          if (parsed.length > 0) {
            setHeaders(Object.keys(parsed[0]))
            setFileData(parsed)
            toast.success(`Loaded ${parsed.length} rows from JSONL file.`)
          }
        } else {
          // Standard CSV parser
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
          if (lines.length > 0) {
            const cols = lines[0].split(',').map(c => c.replace(/^["']|["']$/g, '').trim())
            setHeaders(cols)
            
            const rows = lines.slice(1).map(line => {
              const values = line.split(',')
              const obj: Record<string, string> = {}
              cols.forEach((col, idx) => {
                obj[col] = (values[idx] || '').replace(/^["']|["']$/g, '').trim()
              })
              return obj
            })
            setFileData(rows)
            toast.success(`Loaded ${rows.length} rows from CSV file.`)
          }
        }
      } catch {
        toast.error("Failed to parse the file. Please check structure.")
      }
    }
    reader.readAsText(file)
  }

  const handleStartBatch = async () => {
    if (fileData.length === 0) {
      toast.warning("Upload a dataset file first.")
      return
    }
    if (!status.running) {
      toast.warning("Launch SGLang model server before running batch jobs.")
      return
    }

    setRunning(true)
    setProgress({ completed: 0, total: fileData.length })

    // Generate batch items
    const items: BatchItem[] = fileData.map((row, index) => {
      // Build prompt from template
      let promptText = promptTemplate
      extractedVars.forEach(v => {
        const col = varMappings[v]
        const val = row[col] || ''
        promptText = promptText.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), val)
      })

      return {
        id: index,
        variables: row,
        prompt: promptText,
        response: '',
        status: 'pending'
      }
    })

    setBatchItems(items)

    // Execute concurrently using a worker queue pattern
    const queue = [...items]
    const activeWorkers: Promise<void>[] = []
    let completedCount = 0

    const executeItem = async (item: BatchItem) => {
      // Update item status to running
      setBatchItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'running' } : x))
      
      const startTime = performance.now()
      try {
        const token = localStorage.getItem('access_token')
        const resp = await fetch('/api/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            model: 'default',
            messages: [{ role: 'user', content: item.prompt }],
            temperature: temperature,
            max_tokens: 512,
            stream: false
          })
        })

        if (!resp.ok) throw new Error("Request failed")
        const data = await resp.json()
        const text = data.choices?.[0]?.message?.content || ''
        const tokens = data.usage?.completion_tokens || 0
        const latencyMs = performance.now() - startTime

        setBatchItems(prev => prev.map(x => x.id === item.id ? { 
          ...x, 
          status: 'success', 
          response: text,
          tokens,
          latencyMs
        } : x))
      } catch {
        setBatchItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'error', response: 'Error: Failed to process prompt.' } : x))
      } finally {
        completedCount++
        setProgress(p => ({ ...p, completed: completedCount }))
      }
    }

    const startWorker = async () => {
      while (queue.length > 0) {
        const next = queue.shift()
        if (next) {
          await executeItem(next)
        }
      }
    }

    // Spawn workers matching the parallelism setting
    for (let i = 0; i < Math.min(parallelism, queue.length); i++) {
      activeWorkers.push(startWorker())
    }

    await Promise.all(activeWorkers)
    setRunning(false)
    toast.success("Batch processing completed!")
  }

  const handleExport = () => {
    if (batchItems.length === 0) return
    const content = batchItems.map(item => ({
      variables: item.variables,
      prompt: item.prompt,
      response: item.response,
      status: item.status,
      latency_ms: item.latencyMs,
      tokens: item.tokens
    }))

    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `batch_results_${Date.now()}.json`
    a.click()
    toast.success("Results exported successfully.")
  }

  const progressPct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text">Batch Processing</h1>
        <p className="text-text-muted mt-1">Concurrently feed prompt variables from spreadsheets to SGLang server</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-text text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> Prompt Template Editor
              </h3>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-muted">Template (use double curly brackets for variables)</label>
                <textarea
                  value={promptTemplate}
                  onChange={e => setPromptTemplate(e.target.value)}
                  placeholder='e.g. Write a summary of "{{text}}" under {{word_limit}} words.'
                  className="w-full h-24 p-3 rounded-lg bg-surface-2 border border-border text-xs text-text focus:outline-none focus:border-primary resize-none font-mono"
                />
              </div>

              {extractedVars.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Variable Mappings</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {extractedVars.map(v => (
                      <div key={v} className="flex items-center justify-between gap-3 bg-surface-2/60 px-3 py-1.5 rounded-lg border border-border">
                        <span className="text-xs font-mono font-semibold text-primary">{"{{" + v + "}}"}</span>
                        <select
                          value={varMappings[v] || ''}
                          onChange={e => setVarMappings(prev => ({ ...prev, [v]: e.target.value }))}
                          className="h-7 px-2 rounded bg-surface border border-border text-xs text-text outline-none cursor-pointer"
                        >
                          <option value="">Select column...</option>
                          {headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {batchItems.length > 0 && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <span className="text-xs font-bold text-text uppercase tracking-wider">Run Results</span>
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs">
                    <Download size={13} /> Export Results
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-muted">
                        <th className="py-2.5 font-semibold">Row</th>
                        <th className="py-2.5 font-semibold">Prompt Preview</th>
                        <th className="py-2.5 font-semibold">Response</th>
                        <th className="py-2.5 font-semibold">Status</th>
                        <th className="py-2.5 font-semibold">Speed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {batchItems.map((item) => (
                        <tr key={item.id} className="hover:bg-surface-2/20">
                          <td className="py-3 font-mono font-semibold text-text-muted">{item.id + 1}</td>
                          <td className="py-3 max-w-[200px] truncate pr-4 text-text font-medium" title={item.prompt}>{item.prompt}</td>
                          <td className="py-3 max-w-[240px] truncate pr-4 text-text-muted font-mono" title={item.response}>{item.response || '...'}</td>
                          <td className="py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase",
                              item.status === 'success' ? "bg-success/15 text-success" : 
                              item.status === 'running' ? "bg-primary/15 text-primary animate-pulse" :
                              item.status === 'error' ? "bg-danger/15 text-danger" : "bg-surface-2 text-text-muted"
                            )}>
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3 font-mono text-text-muted">
                            {item.latencyMs && item.tokens 
                              ? `${(item.tokens / (item.latencyMs / 1000)).toFixed(1)} t/s` 
                              : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-text text-sm">Upload Dataset</h3>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-primary/40 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-surface-2/10 transition-colors"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".csv,.jsonl" 
                  className="hidden" 
                />
                <Upload className="h-8 w-8 text-text-muted mb-2.5 opacity-60" />
                <span className="text-xs font-semibold text-text">Choose CSV or JSONL file</span>
                <span className="text-[10px] text-text-muted mt-1">Maximum 5MB file size</span>
              </div>

              {fileName && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-2 border border-border text-xs">
                  <span className="font-mono text-text truncate max-w-[180px]">{fileName}</span>
                  <span className="text-text-muted shrink-0 font-semibold">{fileData.length} records</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-text text-sm">Execution Engine</h3>
              
              <Slider 
                label="Concurrent Workers (Parallelism)"
                value={parallelism}
                onChange={setParallelism}
                min={1}
                max={32}
                step={1}
                description="Number of parallel prompts executing simultaneously"
              />

              <Slider
                label="Generation Temp"
                value={temperature}
                onChange={setTemperature}
                min={0}
                max={1.5}
                step={0.1}
                description="Model creativity temperature setting"
              />

              {running && (
                <div className="space-y-2 pt-2 animate-fade-in">
                  <div className="flex justify-between text-xs font-semibold text-text-muted">
                    <span>Progress</span>
                    <span>{progress.completed} / {progress.total} rows</span>
                  </div>
                  <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              <Button 
                onClick={handleStartBatch} 
                disabled={running || fileData.length === 0} 
                className="w-full gap-2 font-bold mt-2"
              >
                {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? 'Running Batch...' : 'Start Batch Run'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
