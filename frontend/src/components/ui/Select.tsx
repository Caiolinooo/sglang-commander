import { useState, useRef, useEffect } from 'react'
import { cn } from './cn'
import { ChevronDown, Check } from 'lucide-react'

interface Option {
  value: string | number
  label: string
  desc?: string
}

interface SelectProps {
  label?: string
  options: Option[]
  value: string | number
  onChange: (val: string) => void
  error?: string
  description?: string
  className?: string
  disabled?: boolean
}

export function Select({ label, options, value, onChange, error, description, className, disabled }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="space-y-1.5 w-full" ref={containerRef}>
      {label && <label className="text-xs font-semibold text-text-muted">{label}</label>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full h-9 pl-3 pr-10 rounded-lg bg-surface-2 border border-border text-sm text-text text-left transition-all duration-200 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30",
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-border-hover",
            error ? "border-danger focus:border-danger focus:ring-danger/30" : "",
            className
          )}
        >
          <span className="block truncate">{selectedOption?.label ?? 'Select...'}</span>
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-text-muted">
            <ChevronDown size={14} className={cn("transition-transform duration-200", isOpen && "rotate-180")} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-[100] w-full mt-1 rounded-lg border border-border/80 bg-surface-2/95 backdrop-blur-xl shadow-xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto custom-scrollbar">
            <ul className="py-1">
              {options.map((opt) => (
                <li
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value.toString())
                    setIsOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors duration-150",
                    opt.value === value
                      ? "bg-primary/20 text-primary font-medium"
                      : "text-text hover:bg-surface-3"
                  )}
                >
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.desc && <span className="text-[10px] text-text-muted mt-0.5">{opt.desc}</span>}
                  </div>
                  {opt.value === value && <Check size={14} className="text-primary" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {description && <p className="text-[10px] text-text-muted">{description}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
