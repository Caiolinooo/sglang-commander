import { Layers, Terminal, BookOpen, Settings } from 'lucide-react'
import { cn } from '../ui/cn'

interface Template {
  name: string
  icon: any
  prompt: string
  variables?: string[]
}

const TEMPLATES: Template[] = [
  { name: 'Developer assistant', icon: Terminal, prompt: 'You are a senior software architect. Explain technical choices clearly, write clean, robust code with error handling, and explain edge cases.' },
  { name: 'Creative storytelling', icon: BookOpen, prompt: 'You are an award-winning novelist. Respond with highly creative, vivid descriptions, rich characters, and engaging narrative prose.' },
  { name: 'Concise advisor', icon: Settings, prompt: 'Be brief. Answer with bullet points and minimal explanation. Prioritize density of information over conversational fluff.' },
  { name: 'JSON Parser Schema', icon: Layers, prompt: 'Format all output strictly in JSON according to structural requirements. Do not provide markdown wrapper blocks, only raw JSON.' }
]

interface PromptTemplateSelectorProps {
  onSelect: (prompt: string) => void
  currentPrompt?: string
}

export default function PromptTemplateSelector({ onSelect, currentPrompt }: PromptTemplateSelectorProps) {
  return (
    <div className="space-y-3">
      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Playground System Presets</span>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => {
          const Icon = t.icon
          const isActive = currentPrompt === t.prompt
          return (
            <button
              key={t.name}
              onClick={() => onSelect(t.prompt)}
              className={cn(
                "flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer",
                isActive ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text"
              )}
            >
              <Icon size={14} className={isActive ? "text-primary" : "text-text-muted"} />
              <span className="truncate">{t.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
