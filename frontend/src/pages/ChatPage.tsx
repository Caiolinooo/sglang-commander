import { useState, useRef, useEffect, useCallback } from 'react'
import { tts, stt, getServerStatus } from '../api/endpoints'
import { Mic, Square, Volume2, Send, Loader2, Bot, User, MessageSquare, Zap, Clock, Hash, Image, Brain, FileJson, Wrench, ChevronDown, ChevronRight, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { cn } from '../components/ui/Button'

interface ChatMetrics {
  tokensGenerated: number
  elapsedMs: number
  tokensPerSec: number
  promptTokens: number
}

interface ToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  metrics?: ChatMetrics
  tool_calls?: ToolCall[]
  tool_call_id?: string
  reasoning_content?: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your SGLang model. Send a message to start chatting." }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [model, setModel] = useState('')
  const [temp, setTemp] = useState(0.7)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageData, setImageData] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [jsonMode, setJsonMode] = useState(false)
  const [thinkingMode, setThinkingMode] = useState(false)
  const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set())
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set())
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    getServerStatus().then(r => {
      const mp = r.data.model_path
      if (mp) setModel(mp.split('/').pop() || mp)
    }).catch(() => {})
  }, [])

  const handleImageUpload = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImageData(dataUrl)
      setImagePreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleImageUpload(file)
  }, [handleImageUpload])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) handleImageUpload(file)
    }
  }, [handleImageUpload])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return
    setError(null)

    const content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = imageData
      ? [
          { type: 'text', text: input },
          { type: 'image_url', image_url: { url: imageData } },
        ]
      : input

    const userMsg: Message = { role: 'user', content: imageData ? input : content as string }
    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setImageData(null)
    setImagePreview(null)
    setStreaming(true)
    const startTime = performance.now()
    let tokenCount = 0
    let promptTokens = 0
    try {
      const token = localStorage.getItem('access_token')
      const payload: Record<string, unknown> = {
        model: model || 'default',
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        temperature: temp,
        max_tokens: 4096,
        stream: true,
      }
      if (imageData) {
        payload.messages = [...messages, { ...userMsg, content }].map(m => ({ role: m.role, content: m.content }))
      }
      if (jsonMode) {
        payload.response_format = { type: 'json_object' }
      }
      if (thinkingMode) {
        payload.enable_thinking = true
      }

      const resp = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '')
        throw new Error(`Server error ${resp.status}: ${errBody.slice(0, 200)}`)
      }
      const reader = resp.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let reasoningContent = ''
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.error) throw new Error(parsed.error)
              const delta = parsed.choices?.[0]?.delta
              const content = delta?.content || ''
              const rc = delta?.reasoning_content || ''

              if (rc) {
                reasoningContent += rc
              }
              if (content) {
                tokenCount++
              }
              if (parsed.usage?.prompt_tokens) promptTokens = parsed.usage.prompt_tokens

              setMessages(prev => {
                const u = prev.map((m, i) => {
                  if (i !== prev.length - 1) return m
                  return {
                    ...m,
                    content: m.content + content,
                    reasoning_content: reasoningContent || undefined,
                  }
                })
                return u
              })
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
                throw parseErr
              }
            }
          }
        }
      }
      const elapsedMs = performance.now() - startTime
      const metrics: ChatMetrics = {
        tokensGenerated: tokenCount,
        elapsedMs,
        tokensPerSec: tokenCount > 0 ? (tokenCount / (elapsedMs / 1000)) : 0,
        promptTokens,
      }
      setMessages(prev => {
        const u = [...prev]
        const lastIdx = u.length - 1
        if (u[lastIdx]?.role === 'assistant') {
          u[lastIdx] = { ...u[lastIdx], metrics }
        }
        return u
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setMessages(prev => {
        const u = prev.map((m, i) => {
          if (i === prev.length - 1 && m.role === 'assistant' && !m.content) {
            return { ...m, content: `Error: ${msg}` }
          }
          return m
        })
        return u
      })
    } finally { setStreaming(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  const toggleReasoning = (idx: number) => {
    setExpandedReasoning(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleTools = (idx: number) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full animate-in bg-bg" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <div className="px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center gap-4 shadow-sm z-10">
        <div className="flex items-center gap-2 text-text font-bold text-lg">
          <MessageSquare className="h-5 w-5 text-primary" />
          Chat
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-muted">Model</span>
            <Input
              value={model}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)}
              className="w-48 h-8 text-xs bg-bg"
              placeholder="Auto-detect from server"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-muted">Temp</span>
            <Input
              type="number"
              min={0} max={2} step={0.1}
              value={temp}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemp(parseFloat(e.target.value))}
              className="w-16 h-8 text-xs bg-bg text-center px-1"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={jsonMode ? 'primary' : 'secondary'} onClick={() => setJsonMode(!jsonMode)}
              className="gap-1 text-xs h-7 px-2" title="JSON Mode">
              <FileJson size={12} /> JSON
            </Button>
            <Button size="sm" variant={thinkingMode ? 'primary' : 'secondary'} onClick={() => setThinkingMode(!thinkingMode)}
              className="gap-1 text-xs h-7 px-2" title="Thinking Mode">
              <Brain size={12} /> Think
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-2 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-slide-up`}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                msg.role === 'user' ? "bg-primary text-white" : "bg-surface-2 border border-border text-text"
              )}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className="max-w-[80%]">
                {msg.reasoning_content && (
                  <div className="mb-2">
                    <button onClick={() => toggleReasoning(i)}
                      className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors mb-1">
                      {expandedReasoning.has(i) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      <Brain size={10} />
                      <span>Thinking ({msg.reasoning_content.length} chars)</span>
                    </button>
                    {expandedReasoning.has(i) && (
                      <div className="text-xs text-text-muted italic bg-surface-2 rounded-lg p-3 border border-border whitespace-pre-wrap">
                        {msg.reasoning_content}
                      </div>
                    )}
                  </div>
                )}

                <div className={cn(
                  "rounded-2xl px-5 py-3 shadow-sm",
                  msg.role === 'user'
                    ? "bg-primary text-white rounded-tr-sm"
                    : "bg-surface border border-border text-text rounded-tl-sm"
                )}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content || (streaming && i === messages.length - 1 ? <span className="animate-pulse">●●●</span> : '')}
                  </p>
                </div>

                {msg.tool_calls && msg.tool_calls.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <button onClick={() => toggleTools(i)}
                      className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors">
                      {expandedTools.has(i) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      <Wrench size={10} />
                      <span>{msg.tool_calls.length} tool call(s)</span>
                    </button>
                    {expandedTools.has(i) && msg.tool_calls.map((tc, j) => (
                      <div key={j} className="bg-surface-2 rounded-lg p-2 border border-border text-xs font-mono">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-primary font-semibold">{tc.function.name}</span>
                          <span className="text-text-muted">({tc.id})</span>
                        </div>
                        <pre className="text-text-muted whitespace-pre-wrap text-[11px]">{tc.function.arguments}</pre>
                      </div>
                    ))}
                  </div>
                )}

                {msg.metrics && (
                  <div className="flex items-center gap-3 mt-1.5 ml-1 text-[10px] text-text-muted font-medium">
                    <span className="flex items-center gap-1" title="Tokens generated">
                      <Hash size={10} /> {msg.metrics.tokensGenerated} tokens
                    </span>
                    <span className="flex items-center gap-1" title="Generation speed">
                      <Zap size={10} className="text-success" /> {msg.metrics.tokensPerSec.toFixed(1)} tok/s
                    </span>
                    <span className="flex items-center gap-1" title="Total time">
                      <Clock size={10} /> {(msg.metrics.elapsedMs / 1000).toFixed(2)}s
                    </span>
                    {msg.metrics.promptTokens > 0 && (
                      <span className="flex items-center gap-1" title="Prompt tokens">
                        <Bot size={10} /> {msg.metrics.promptTokens} prompt
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="border-t border-border bg-surface p-4">
        <div className="max-w-4xl mx-auto">
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img src={imagePreview} alt="Upload" className="h-20 rounded-lg border border-border" />
              <button onClick={() => { setImageData(null); setImagePreview(null) }}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center">
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 mb-3">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }} />
            <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Image className="h-3 w-3" /> Image
            </Button>
            <Button
              size="sm"
              variant={recording ? 'danger' : 'secondary'}
              onClick={async () => {
                if (recording) { mediaRecorder.current?.stop(); setRecording(false); return }
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                  const mr = new MediaRecorder(stream)
                  audioChunks.current = []
                  mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data) }
                  mr.onstop = async () => {
                    const blob = new Blob(audioChunks.current, { type: 'audio/wav' })
                    try { const r = await stt(blob); setInput(prev => prev + (prev ? ' ' : '') + r.data.text) } catch {}
                    stream.getTracks().forEach(t => t.stop())
                  }
                  mr.start(); mediaRecorder.current = mr; setRecording(true)
                } catch {}
              }}
              className="gap-2"
            >
              {recording ? <Square className="h-3 w-3 animate-pulse" /> : <Mic className="h-3 w-3" />}
              {recording ? 'Recording...' : 'STT'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const last = [...messages].reverse().find(m => m.role === 'assistant')
                if (!last) return
                try { const r = await tts(last.content); setAudioUrl(URL.createObjectURL(r.data)) } catch {}
              }}
              className="gap-2"
            >
              <Volume2 className="h-3 w-3" /> TTS
            </Button>
            {audioUrl && <audio src={audioUrl} controls className="h-8 max-w-[200px]" />}
          </div>

          <div className="flex items-end gap-3 bg-surface-2 border border-border rounded-xl p-2 focus-within:ring-2 focus-within:ring-primary/50 transition-shadow shadow-sm">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type your message... (Shift+Enter for new line, Ctrl+V to paste images)"
              className="flex-1 max-h-32 min-h-[44px] px-3 py-2.5 bg-transparent resize-none focus:outline-none text-sm text-text placeholder:text-text-muted"
              rows={1}
            />
            <Button
              onClick={sendMessage}
              disabled={streaming || !input.trim()}
              className="mb-1 rounded-lg h-9 w-10 p-0"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
