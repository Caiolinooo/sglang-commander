import { useState, useEffect } from 'react'
import { runDiagnostics, autoFix } from '../api/endpoints'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Activity, AlertCircle, CheckCircle, RefreshCw, Zap, Wrench } from 'lucide-react'

interface CheckResult {
  name: string
  ok: boolean
  message: string
  fix?: string
  severity: string
}

interface DiagnosticReport {
  can_run: boolean
  checks: CheckResult[]
  errors: string[]
  warnings: string[]
  fix_suggestions: string[]
  python: string
}

const FIXABLE_CHECKS = ['transformers', 'kernels', 'flash-attn', 'triton', 'sglang', 'torch']

export default function DiagnosticsPage() {
  const [report, setReport] = useState<DiagnosticReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing] = useState<string | null>(null)
  const [fixMsg, setFixMsg] = useState('')

  const run = async () => {
    setLoading(true)
    try { const r = await runDiagnostics(); setReport(r.data) } catch (e: any) { setFixMsg(`Failed: ${e.message}`) }
    setLoading(false)
  }

  useEffect(() => { run() }, [])

  const handleFix = async (checkName: string) => {
    setFixing(checkName)
    setFixMsg('')
    try {
      const r = await autoFix(checkName)
      setFixMsg(r.data.message)
      setTimeout(run, 1000)
    } catch (e: any) {
      setFixMsg(`Failed: ${e.response?.data?.detail || e.message}`)
    }
    setFixing(null)
  }

  return (
    <div className="p-8 space-y-6 animate-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">System Diagnostics</h1>
          <p className="text-text-muted mt-1">Verify your system is ready to launch SGLang models</p>
        </div>
        <Button onClick={run} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Running...' : 'Run Diagnostics'}
        </Button>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Overall Status</p>
                    <p className={`text-2xl font-bold mt-1 ${report.can_run ? 'text-success' : 'text-danger'}`}>
                      {report.can_run ? 'Ready' : 'Not Ready'}
                    </p>
                  </div>
                  {report.can_run ? <CheckCircle className="w-10 h-10 text-success opacity-50" /> : <AlertCircle className="w-10 h-10 text-danger opacity-50" />}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Errors</p>
                <p className="text-2xl font-bold mt-1 text-danger">{report.errors.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Warnings</p>
                <p className="text-2xl font-bold mt-1 text-warning">{report.warnings.length}</p>
              </CardContent>
            </Card>
          </div>

          {fixMsg && (
            <div className="bg-info/10 border border-info/30 text-info px-4 py-3 rounded-xl text-sm">
              {fixMsg}
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <CardTitle>System Checks</CardTitle>
              </div>
              <CardDescription>
                Python: <code className="text-xs bg-surface-2 px-1.5 py-0.5 rounded">{report.python}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {report.checks.map((check, i) => {
                const fixableName = check.name.toLowerCase().split(' ')[0]
                const canFix = FIXABLE_CHECKS.includes(fixableName) && !check.ok
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
                    !check.ok && check.severity === 'error' ? 'bg-danger/5 border-danger/20' :
                    !check.ok && check.severity === 'warning' ? 'bg-warning/5 border-warning/20' :
                    'bg-success/5 border-success/20'
                  }`}>
                    <div className="mt-0.5">
                      {check.ok ? <CheckCircle className="w-5 h-5 text-success" /> :
                       check.severity === 'error' ? <AlertCircle className="w-5 h-5 text-danger" /> :
                       <AlertCircle className="w-5 h-5 text-warning" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-text">{check.name}</span>
                        <Badge variant={check.ok ? 'success' : check.severity === 'error' ? 'danger' : 'warning'}>
                          {check.ok ? 'PASS' : check.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 break-words">{check.message}</p>
                      {check.fix && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <code className="text-[10px] bg-bg px-2 py-1 rounded font-mono text-text-muted break-all">{check.fix}</code>
                          {canFix && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleFix(fixableName)}
                              disabled={fixing === fixableName}
                              className="h-7 text-xs gap-1"
                            >
                              <Wrench className="w-3 h-3" />
                              {fixing === fixableName ? 'Fixing...' : 'Auto-fix'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {report.fix_suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <CardTitle>Quick Fixes</CardTitle>
                </div>
                <CardDescription>Run these commands to resolve issues</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.fix_suggestions.map((sug, i) => (
                  <code key={i} className="block text-xs bg-surface-2 px-3 py-2 rounded-lg font-mono break-all">
                    {sug}
                  </code>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
