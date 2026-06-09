import { cn } from './cn'
import { X } from 'lucide-react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  side?: 'left' | 'right'
  className?: string
}

export function Drawer({ open, onClose, title, children, side = 'right', className }: DrawerProps) {
  if (!open) return null

  const sideClasses = {
    left: 'left-0 h-full w-80 sm:w-96 border-r border-border slide-in-from-left',
    right: 'right-0 h-full w-80 sm:w-96 border-l border-border slide-in-from-right',
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs animate-fade-in" onClick={onClose}>
      <div
        className={cn(
          "fixed bg-surface h-full flex flex-col shadow-2xl animate-in duration-200",
          sideClasses[side],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          {title ? <h3 className="font-bold text-text text-base">{title}</h3> : <div />}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
