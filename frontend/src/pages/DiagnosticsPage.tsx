import { useState, useEffect } from 'react'
import { runDiagnostics, autoFix, getVersions } from '../api/endpoints'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Activity, AlertCircle, CheckCircle, RefreshCw, Zap, Wrench, ChevronDown, ChevronRight, Copy, Package } from 'lucide-react'

interface CheckResult {
  name: string
  ok: boolean
  message: string
  fix?: string
  severity: string
  full_error?: string
}

interface DiagnosticReport {
  can_run: boolean
  checks: CheckResult[]
  errors: string[]
  warnings: string[]
  fix_suggestions: string[]
  versions: Record<string, string>
  python: string
}

const FIXABLE_CHECKS: Record<string, string> = {
  transformers: 'transformers',
  kernels: 'kernels',
  'flash-attn': 'flash-attn',
  triton: 'triton',
  sglang: 'sglang',
  torch: 'torch',
}

const NUCLEAR_FIXES = [
  { key: 'all-compat', label: 'Fix all compat (transformers 5.6.0 + kernels 0.10.0 + sglang)', desc: 'Known-good combo for sglang 0.5.12' },
  { key: 'sglang-force', label: 'Force reinstall sglang', desc: 'Nuclear option: --force-reinstall --no-deps' },
]

export default function DiagnosticsPage() {
  const [report, setReport] = useState<DiagnosticReport | null>(null)
  const [versions, setVersions] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing] = useState<string | null>(null)
  const [fixMsg, setFixMsg] = useState('')
  const [fixError, setFixError] = useState('')
  const [showFull, setShowFull] = useState<Record<string, boolean>>({})

  const run = async () => {
    setLoading(true)
    setFixMsg('')
    setFixError('')
    try {
      const [r, v] = await Promise.all([runDiagnostics(true), getVersions()])
      setReport(r.data)
      setVersions(v.data.versions)
    } catch (e: any) {
      setFixError(`Failed: ${e.message}`)
    }
    setLoading(false)
  }

  useEffect(() => { run() }, [])

  const handleFix = async (checkName: string) => {
    setFixing(checkName)
    setFixMsg('')
    setFixError('')
    try {
      const r = await autoFix(checkName)
      if (r.data.status === 'ok') {
        setFixMsg(`✓ ${r.data.message}`)
        if (r.data.stdout_tail) setFixMsg((m) => `${m}\n${r.data.stdout_tail}`)
      } else {
        setFixError(`${r.data.message}\n${r.data.error_tail || ''}`)
      }
      setTimeout(run, 1500)
    } catch (e: any) {
      setFixError(`Failed: ${e.response?.data?.detail || e.message}`)
    }
    setFixing(null)
  }

  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
    setFixMsg('Copied to clipboard')
    setTimeout(() => setFixMsg(''), 1500)
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
            <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-xl text-sm whitespace-pre-wrap font-mono">
              {fixMsg}
            </div>
          )}
          {fixError && (
            <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm whitespace-pre-wrap font-mono">
              {fixError}
            </div>
          )}

          {versions && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  <CardTitle>Installed Versions</CardTitle>
                </div>
                <CardDescription>Python: <code className="text-xs bg-surface-2 px-1.5 py-0.5 rounded">{report.python}</code></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {Object.entries(versions).map(([pkg, ver]) => {
                    const isMissing = ver.startsWith('NOT_INSTALLED')
                    return (
                      <div key={pkg} className="flex items-center justify-between bg-surface-2/50 px-3 py-2 rounded-lg">
                        <span className="font-mono font-semibold text-text">{pkg}</span>
                        <span className={`font-mono text-xs ${isMissing ? 'text-danger' : 'text-text-muted'}`}>
                          {isMissing ? '✗' : ver}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <CardTitle>System Checks</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {report.checks.map((check, i) => {
                const fixableName = check.name.toLowerCase().split(' ')[0]
                const fixCmd = FIXABLE_CHECKS[fixableName]
                const canFix = fixCmd && !check.ok
                const expanded = showFull[check.name] || false

                return (
                  <div key={i} className={`p-3 rounded-xl border ${
                    !check.ok && check.severity === 'error' ? 'bg-danger/5 border-danger/20' :
                    !check.ok && check.severity === 'warning' ? 'bg-warning/5 border-warning/20' :
                    'bg-success/5 border-success/20'
                  }`}>
                    <div className="flex items-start gap-3">
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

                        {check.full_error && (
                          <button
                            onClick={() => setShowFull({ ...showFull, [check.name]: !expanded })}
                            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text mt-1"
                          >
                            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {expanded ? 'Hide' : 'Show'} full error
                          </button>
                        )}

                        {expanded && check.full_error && (
                          <pre className="mt-2 text-[10px] bg-bg/60 border border-border/50 px-2 py-2 rounded font-mono text-text-muted whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                            {check.full_error}
                          </pre>
                        )}

                        {check.fix && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <code className="text-[10px] bg-bg px-2 py-1 rounded font-mono text-text-muted break-all flex-1 min-w-0">
                              {check.fix}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyCmd(check.fix!)}
                              className="h-7 w-7 p-0"
                              title="Copy"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            {canFix && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleFix(fixCmd)}
                                disabled={fixing === fixCmd}
                                className="h-7 text-xs gap-1"
                              >
                                <Wrench className="w-3 h-3" />
                                {fixing === fixCmd ? 'Fixing...' : 'Auto-fix'}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <CardTitle>Nuclear Options</CardTitle>
              </div>
              <CardDescription>Last-resort fixes when normal auto-fix doesn't work</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {NUCLEAR_FIXES.map((fix) => (
                <div key={fix.key} className="flex items-center justify-between p-3 rounded-xl bg-surface-2/40 border border-border/50">
                  <div>
                    <p className="text-sm font-semibold text-text">{fix.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{fix.desc}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleFix(fix.key)}
                    disabled={fixing === fix.key}
                    className="gap-1"
                  >
                    <Wrench className="w-3 h-3" />
                    {fixing === fix.key ? 'Running...' : 'Run'}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
