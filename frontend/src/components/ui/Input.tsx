import { cn } from './cn'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: React.ReactNode
}

export const Input = ({ className, icon, ...props }: InputProps) => {
  return (
    <div className="relative">
      {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">{icon}</div>}
      <input
        className={cn(
          "w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition",
          icon && "pl-9",
          className
        )}
        {...props}
      />
    </div>
  )
}
