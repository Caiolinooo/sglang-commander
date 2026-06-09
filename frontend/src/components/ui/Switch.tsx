import { cn } from './cn'

interface SwitchProps {
  checked: boolean
  onChange: (val: boolean) => void
  label?: string
  disabled?: boolean
  description?: string
  className?: string
}

export function Switch({ checked, onChange, label, disabled, description, className }: SwitchProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label 
        className={cn(
          "flex items-center gap-3 py-1.5 select-none", 
          disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer group"
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            "w-9 h-5 rounded-full transition-colors relative outline-none cursor-pointer focus:ring-2 focus:ring-primary/40",
            checked ? "bg-primary" : "bg-surface-2 border border-border"
          )}
        >
          <div 
            className={cn(
              "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-xs",
              checked ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
        {label && (
          <span className={cn("text-xs font-semibold text-text", !disabled && "group-hover:text-primary transition-colors")}>
            {label}
          </span>
        )}
      </label>
      {description && <p className="text-[10px] text-text-muted pl-12">{description}</p>}
    </div>
  )
}
