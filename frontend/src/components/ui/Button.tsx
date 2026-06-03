import { cn } from './cn'
export { cn } from './cn'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-primary hover:bg-primary-hover text-white shadow-sm',
    secondary: 'bg-surface-2 hover:bg-surface-3 text-text border border-border',
    danger: 'bg-danger hover:bg-danger/90 text-white',
    outline: 'border border-border bg-transparent hover:bg-surface-2 text-text',
    ghost: 'hover:bg-surface-2 text-text',
  }
  const sizes = {
    sm: 'h-8 px-3 text-xs rounded-md',
    md: 'h-9 px-4 text-sm rounded-lg',
    lg: 'h-11 px-6 text-sm rounded-lg font-semibold',
    icon: 'h-9 w-9 rounded-lg flex items-center justify-center',
  }
  return <button className={cn("inline-flex items-center justify-center font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none", variants[variant], sizes[size], className)} {...props} />
}
