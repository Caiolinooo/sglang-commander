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
          "w-full h-9 px-3 rounded-lg bg-surface-2 border border-border text-sm text-text placeholder:text-text-muted transition-all duration-200 outline-none hover:border-border-hover focus:border-primary focus:ring-1 focus:ring-primary/30",
          icon && "pl-9",
          className
        )}
        {...props}
      />
    </div>
  )
}
