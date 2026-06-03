import React from 'react'
import { cn } from './Button'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-surface-2 text-text hover:bg-border-hover',
    success: 'border-transparent bg-success/20 text-success',
    warning: 'border-transparent bg-warning/20 text-warning',
    danger: 'border-transparent bg-danger/20 text-danger',
    outline: 'text-text',
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
