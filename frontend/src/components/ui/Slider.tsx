import { cn } from './cn'

interface SliderProps {
  label?: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  format?: (v: number) => string
  description?: string
  className?: string
}

export function Slider({ label, value, onChange, min, max, step = 1, unit = '', format, description, className }: SliderProps) {
  const display = format ? format(value) : value.toString()
  
  return (
    <div className={cn("space-y-1.5 w-full", className)}>
      <div className="flex items-center justify-between">
        {label && <label className="text-xs font-semibold text-text-muted">{label}</label>}
        <span className="text-xs font-mono font-semibold bg-surface-2 px-2 py-0.5 rounded border border-border">
          {display}{unit}
        </span>
      </div>
      {description && <p className="text-[10px] text-text-muted">{description}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-surface-2 rounded-full appearance-none cursor-pointer accent-primary outline-none focus:ring-1 focus:ring-primary/20"
      />
    </div>
  )
}
