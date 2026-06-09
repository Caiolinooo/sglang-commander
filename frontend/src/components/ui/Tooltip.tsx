import { useState } from 'react'
import { cn } from './cn'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function Tooltip({ content, children, position = 'top', className }: TooltipProps) {
  const [visible, setVisible] = useState(false)

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrowPositions = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-surface-2 border-x-transparent border-b-transparent border-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-surface-2 border-x-transparent border-t-transparent border-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-surface-2 border-y-transparent border-r-transparent border-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-surface-2 border-y-transparent border-l-transparent border-4',
  }

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div 
          className={cn(
            "absolute z-50 px-2 py-1 text-[10px] font-medium text-text bg-surface-2 border border-border rounded shadow-lg whitespace-nowrap pointer-events-none animate-fade-in",
            positions[position],
            className
          )}
        >
          {content}
          <div className={cn("absolute w-0 h-0 border-solid", arrowPositions[position])} />
        </div>
      )}
    </div>
  )
}
