import { useServerStore } from '../../stores'
import { XCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'

export default function ValidationPanel() {
  const { validation, flagIssues } = useServerStore()

  const all = [
    ...(validation?.errors?.map((e: string) => ({ type: 'error' as const, message: e, fix: undefined })) || []),
    ...(validation?.warnings?.map((w: string) => ({ type: 'warning' as const, message: w, fix: undefined })) || []),
    ...(validation?.suggestions?.map((s: string) => ({ type: 'info' as const, message: s, fix: undefined })) || []),
    ...flagIssues,
  ]

  if (all.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 bg-success/15 border border-success/30 rounded-lg text-success text-xs font-semibold">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Configuration is valid. No warnings or conflicts found!</span>
      </div>
    )
  }

  const iconMap = { error: XCircle, warning: AlertTriangle, info: Info }
  const borderMap = { 
    error: 'border-danger/30 bg-danger/10 text-danger', 
    warning: 'border-warning/30 bg-warning/10 text-warning', 
    info: 'border-info/30 bg-info/10 text-info' 
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
        Pre-Flight Validation ({all.length} items)
      </div>
      <div className="space-y-1.5">
        {all.map((item, i) => {
          const type = ((item.type === 'error' || item.type === 'warning' || item.type === 'info') ? item.type : 'info') as 'error' | 'warning' | 'info'
          const Icon = iconMap[type]
          return (
            <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs leading-relaxed ${borderMap[type]}`}>
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span>{item.message}</span>
                {item.fix && <span className="block text-[10px] opacity-85 mt-1 font-semibold">Recommended Fix: {item.fix}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
