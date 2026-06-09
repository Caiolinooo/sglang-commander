import { cn } from './cn'
import { ChevronDown } from 'lucide-react'

interface Option {
  value: string | number
  label: string
  desc?: string
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string
  options: Option[]
  value: string | number
  onChange: (val: string) => void
  error?: string
  description?: string
}

export function Select({ label, options, value, onChange, error, description, className, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5 w-full">
      {label && <label className="text-xs font-semibold text-text-muted">{label}</label>}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full h-9 pl-3 pr-10 rounded-lg bg-surface-2 border border-border text-sm text-text transition-colors duration-200 outline-none focus:border-primary cursor-pointer appearance-none",
            error ? "border-danger focus:border-danger" : "",
            className
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-surface text-text">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-text-muted">
          <ChevronDown size={14} />
        </div>
      </div>
      {description && <p className="text-[10px] text-text-muted">{description}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
