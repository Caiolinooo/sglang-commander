import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore, useChatStore, useServerStore } from '../stores'
import { Search, Server, Cpu, MessageSquare, Play, Square, Settings, FileSpreadsheet, GitCompare, Brain, Plus } from 'lucide-react'
import { cn } from './ui/cn'

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: typeof Server
  action: () => void
  category: string
}

export default function CommandPalette() {
  const { showCommandPalette, setShowCommandPalette } = useUIStore()
  const { newConversation, setThinkingMode } = useChatStore()
  const { status, startServer, stopServer } = useServerStore()
  
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const items: CommandItem[] = [
    // Navigation
    { id: 'nav-server', title: 'Go to Server Control', subtitle: 'Monitor, configure, and start the engine', icon: Server, category: 'Navigation', action: () => { navigate('/'); setShowCommandPalette(false) } },
    { id: 'nav-models', title: 'Go to Models Hub', subtitle: 'Download and load HuggingFace models', icon: Cpu, category: 'Navigation', action: () => { navigate('/models'); setShowCommandPalette(false) } },
    { id: 'nav-chat', title: 'Go to Chat Playground', subtitle: 'Interact with the running model', icon: MessageSquare, category: 'Navigation', action: () => { navigate('/chat'); setShowCommandPalette(false) } },
    { id: 'nav-batch', title: 'Go to Batch Processing', subtitle: 'Run CSV/JSONL files in parallel', icon: FileSpreadsheet, category: 'Navigation', action: () => { navigate('/batch'); setShowCommandPalette(false) } },
    { id: 'nav-connections', title: 'Go to SSH Connections', subtitle: 'Manage remote host connections', icon: Settings, category: 'Navigation', action: () => { navigate('/connections'); setShowCommandPalette(false) } },
    { id: 'nav-compare', title: 'Go to Compare Models', subtitle: 'Run side-by-side model tests', icon: GitCompare, category: 'Navigation', action: () => { navigate('/compare'); setShowCommandPalette(false) } },
    
    // Server Control
    { id: 'server-start', title: 'Start SGLang Server', subtitle: 'Launch the server with loaded configs', icon: Play, category: 'Control', action: () => { startServer(); setShowCommandPalette(false) } },
    { id: 'server-stop', title: 'Stop SGLang Server', subtitle: 'Shutdown the running instance', icon: Square, category: 'Control', action: () => { stopServer(); setShowCommandPalette(false) } },
    
    // Chat Actions
    { id: 'chat-new', title: 'Create New Conversation', subtitle: 'Clear current playground and start fresh', icon: Plus, category: 'Chat', action: () => { newConversation(); navigate('/chat'); setShowCommandPalette(false) } },
    { id: 'chat-think', title: 'Toggle Deep Thinking', subtitle: 'Toggle Deepseek R1 extraction', icon: Brain, category: 'Chat', action: () => { setThinkingMode(!useChatStore.getState().thinkingMode); setShowCommandPalette(false) } },
  ]

  const filtered = items.filter(item => 
    item.title.toLowerCase().includes(query.toLowerCase()) || 
    item.subtitle?.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K to open/close Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCommandPalette(!showCommandPalette)
      }

      // Escape to close
      if (e.key === 'Escape' && showCommandPalette) {
        e.preventDefault()
        setShowCommandPalette(false)
      }

      // Arrow keys
      if (showCommandPalette) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % filtered.length)
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length)
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          if (filtered[selectedIndex]) {
            filtered[selectedIndex].action()
          }
        }
      }

      // Ctrl+N for new conversation
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        newConversation()
        navigate('/chat')
      }

      // Ctrl+Shift+S to Start/Stop Server
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (status.running) {
          stopServer()
        } else {
          startServer()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCommandPalette, filtered, selectedIndex, status.running, setShowCommandPalette, newConversation, navigate, startServer, stopServer])

  useEffect(() => {
    if (showCommandPalette) {
      const id = setTimeout(() => {
        setQuery('')
        setSelectedIndex(0)
        inputRef.current?.focus()
      }, 0)
      return () => clearTimeout(id)
    }
  }, [showCommandPalette])

  if (!showCommandPalette) return null

  // Group by category
  const categories: Record<string, CommandItem[]> = {}
  filtered.forEach(item => {
    if (!categories[item.category]) categories[item.category] = []
    categories[item.category].push(item)
  })

  let globalIndex = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] bg-black/60 backdrop-blur-xs" onClick={() => setShowCommandPalette(false)}>
      <div 
        className="bg-surface border border-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-in duration-100 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative border-b border-border flex items-center px-4">
          <Search className="h-4 w-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or navigate..."
            className="w-full h-11 bg-transparent px-3 text-sm text-text focus:outline-none placeholder:text-text-muted"
          />
          <kbd className="text-[10px] font-mono bg-surface-2 border border-border rounded px-1.5 py-0.5 text-text-muted select-none">ESC</kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2 scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="text-xs text-text-muted p-4 text-center">No matching commands or pages found.</p>
          ) : (
            Object.entries(categories).map(([cat, catItems]) => (
              <div key={cat} className="space-y-1">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-3.5 py-2 block">{cat}</span>
                {catItems.map((item) => {
                  const itemIdx = globalIndex++
                  const isSelected = itemIdx === selectedIndex
                  const Icon = item.icon
                  
                  return (
                    <div
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(itemIdx)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-left",
                        isSelected ? "bg-primary text-white" : "hover:bg-surface-2 text-text"
                      )}
                    >
                      <Icon size={16} className={isSelected ? "text-white" : "text-text-muted"} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{item.title}</p>
                        {item.subtitle && (
                          <p className={cn("text-[10px] mt-0.5 truncate", isSelected ? "text-white/80" : "text-text-muted")}>
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
