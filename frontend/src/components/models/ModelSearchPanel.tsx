import { useModelsStore } from '../../stores'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Search, Filter, RefreshCw, X, Layers, Database, Shield, Globe, Zap, Box } from 'lucide-react'
import { useState } from 'react'

const TRENDING_SEARCHES = ['llama', 'qwen', 'deepseek', 'whisper', 'mistral', 'phi-3', 'gemma', 'yi', 'command-r']

const FILTER_SECTIONS = [
  { id: 'task', label: 'Pipeline / Task', icon: Layers, options: [
    { value: 'text-generation', label: 'Text Generation' },
    { value: 'image-text-to-text', label: 'Vision / Multimodal' },
    { value: 'text-embedding', label: 'Embeddings' },
    { value: 'automatic-speech-recognition', label: 'Speech-to-Text' },
    { value: 'text-to-speech', label: 'Text-to-Speech' },
  ]},
  { id: 'library', label: 'Library', icon: Database, options: [
    { value: 'transformers', label: 'Transformers' },
    { value: 'safetensors', label: 'SafeTensors' },
    { value: 'gguf', label: 'GGUF' },
    { value: 'pytorch', label: 'PyTorch' },
  ]},
  { id: 'license', label: 'License', icon: Shield, options: [
    { value: 'apache-2.0', label: 'Apache 2.0' },
    { value: 'mit', label: 'MIT' },
    { value: 'llama', label: 'Llama' },
    { value: 'gemma', label: 'Gemma' },
    { value: 'bsd', label: 'BSD' },
  ]},
  { id: 'language', label: 'Language', icon: Globe, options: [
    { value: 'en', label: 'English' },
    { value: 'zh', label: 'Chinese' },
    { value: 'multilingual', label: 'Multilingual' },
  ]},
  { id: 'quantization', label: 'Quantization', icon: Zap, options: [
    { value: 'none', label: 'None (Full)' },
    { value: 'awq', label: 'AWQ' },
    { value: 'fp8', label: 'FP8' },
    { value: 'gptq', label: 'GPTQ' },
  ]},
  { id: 'format', label: 'Format', icon: Box, options: [
    { value: 'safetensors', label: 'SafeTensors' },
    { value: 'gguf', label: 'GGUF' },
    { value: 'pytorch', label: 'PyTorch' },
  ]},
]

export default function ModelSearchPanel() {
  const {
    query,
    setQuery,
    search,
    searching,
    filters,
    setFilters,
    clearFilters
  } = useModelsStore()
  
  const [showFilters, setShowFilters] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      search()
    }
  }

  const setFilter = (key: string, value: string) => {
    const next = { ...filters }
    if (value) (next as any)[key] = value
    else delete (next as any)[key]
    setFilters(next)
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search HuggingFace models (e.g. meta-llama/Llama-3)..."
            className="pl-9 h-10 pr-10"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          {query && (
            <button 
              onClick={() => { setQuery(''); setTimeout(() => search(''), 50) }} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
        
        <Button onClick={() => search()} disabled={searching} className="gap-2 h-10 px-5 font-bold">
          {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
        
        <Button 
          variant={activeFilterCount > 0 ? 'primary' : 'secondary'} 
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2 h-10 px-4"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="success" className="ml-0.5 text-[9px] py-0 px-1 bg-white text-primary">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-text-muted">
        <span className="font-semibold">Suggestions:</span>
        {TRENDING_SEARCHES.map(t => (
          <button 
            key={t}
            onClick={() => { setQuery(t); search(t) }}
            className="px-2 py-0.5 rounded bg-surface-2 hover:bg-border-hover text-[11px] text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            {t}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="p-4 bg-surface border border-border rounded-xl space-y-4 animate-fade-in">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <span className="text-xs font-bold text-text uppercase tracking-wider">Search Filters</span>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-[10px] text-danger font-bold hover:underline">
                Clear All
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {FILTER_SECTIONS.map(section => {
              const Icon = section.icon
              const selectedValue = (filters as any)[section.id] || ''
              
              return (
                <div key={section.id} className="space-y-1.5">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <Icon size={10} className="text-primary" /> {section.label}
                  </span>
                  <select 
                    value={selectedValue}
                    onChange={e => setFilter(section.id, e.target.value)}
                    className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">All</option>
                    {section.options.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
