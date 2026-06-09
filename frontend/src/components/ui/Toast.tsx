import { useState, useEffect } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from './cn'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration?: number
}

type Listener = (toasts: ToastItem[]) => void
const listeners = new Set<Listener>()
let activeToasts: ToastItem[] = []

const notify = () => {
  listeners.forEach(l => l([...activeToasts]))
}

export const toast = {
  show: (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: ToastItem = { id, message, type, duration }
    activeToasts = [...activeToasts, newToast]
    notify()
    
    if (duration > 0) {
      setTimeout(() => {
        toast.dismiss(id)
      }, duration)
    }
  },
  success: (message: string, duration = 3000) => toast.show(message, 'success', duration),
  error: (message: string, duration = 4000) => toast.show(message, 'error', duration),
  info: (message: string, duration = 3000) => toast.show(message, 'info', duration),
  warning: (message: string, duration = 3000) => toast.show(message, 'warning', duration),
  dismiss: (id: string) => {
    activeToasts = activeToasts.filter(t => t.id !== id)
    notify()
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handleChange = (newToasts: ToastItem[]) => setToasts(newToasts)
    listeners.add(handleChange)
    return () => {
      listeners.delete(handleChange)
    }
  }, [])

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-success shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-danger shrink-0" />,
    warning: <AlertCircle className="w-4 h-4 text-warning shrink-0" />,
    info: <Info className="w-4 h-4 text-info shrink-0" />
  }

  const borderColors = {
    success: 'border-success/30 bg-surface border-l-4 border-l-success',
    error: 'border-danger/30 bg-surface border-l-4 border-l-danger',
    warning: 'border-warning/30 bg-surface border-l-4 border-l-warning',
    info: 'border-info/30 bg-surface border-l-4 border-l-info'
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 p-3.5 rounded-lg border shadow-lg animate-in slide-in-from-bottom-2",
            borderColors[t.type]
          )}
        >
          {icons[t.type]}
          <div className="flex-1 text-xs text-text font-medium leading-relaxed">{t.message}</div>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-text-muted hover:text-text transition-colors p-0.5"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
