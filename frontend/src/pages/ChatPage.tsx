import { useState, useRef, useEffect } from 'react'
import { tts, stt } from '../api/endpoints'
import { Mic, Square, Volume2, Send, Loader2, Bot, User, MessageSquare } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { cn } from '../components/ui/Button'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your SGLang model. Send a message to start chatting." }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [model, setModel] = useState('default')
  const [temp, setTemp] = useState(0.7)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return
    const userMsg: Message = { role: 'user', content: input }
    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)
    try {
      const resp = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
        body: JSON.stringify({ model, messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })), temperature: temp, max_tokens: 4096, stream: true }),
      })
      if (!resp.ok) throw new Error('Chat request failed')
      const reader = resp.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
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
              const content = parsed.choices?.[0]?.delta?.content || ''
              if (content) setMessages(prev => { const u = [...prev]; u[u.length - 1].content += content; return u })
            } catch {}
          }
        }
      }
    } catch (e) {
      setMessages(prev => { const u = [...prev]; const last = u[u.length - 1]; if (last.role === 'assistant' && !last.content) last.content = `Error: ${e}`; return u })
    } finally { setStreaming(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  return (
    <div className="flex flex-col h-full animate-in bg-bg">
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
              className="w-40 h-8 text-xs bg-bg"
              placeholder="Model name" 
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
        </div>
      </div>

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
              <div className={cn(
                "max-w-[80%] rounded-2xl px-5 py-3 shadow-sm",
                msg.role === 'user'
                  ? "bg-primary text-white rounded-tr-sm"
                  : "bg-surface border border-border text-text rounded-tl-sm"
              )}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content || (streaming && i === messages.length - 1 ? <span className="animate-pulse">●●●</span> : '')}
                </p>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="border-t border-border bg-surface p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
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
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for new line)"
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
