import { cn } from './cn'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div 
        className={cn(
          "bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 animate-in focus:outline-none",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h3 className="text-lg font-bold text-text">{title}</h3>}
            {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div>
          {children}
        </div>
      </div>
    </div>
  )
}
