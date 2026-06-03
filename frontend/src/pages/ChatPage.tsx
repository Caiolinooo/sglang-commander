import { useState, useRef, useEffect } from 'react'
import { tts, stt } from '../api/endpoints'

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
    <div className="flex flex-col h-full animate-fade-in">
      <div className="p-4 border-b border-border/50 glass flex items-center gap-3">
        <h1 className="text-sm font-bold gradient-text">Chat</h1>
        <input value={model} onChange={e => setModel(e.target.value)}
          className="flex-1 max-w-[200px] px-3 py-1.5 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs"
          placeholder="Model name" />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Temp:</span>
          <input type="number" min={0} max={2} step={0.1} value={temp} onChange={e => setTemp(parseFloat(e.target.value))}
            className="w-14 px-2 py-1 rounded-lg bg-bg border border-border text-xs focus:outline-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-gradient-to-r from-primary to-secondary text-white rounded-br-sm shadow-lg shadow-primary/20'
                : 'glass rounded-bl-sm'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content || (streaming && i === messages.length - 1 ? '\u25a0\u25a0\u25a0' : '')}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="border-t border-border/50 p-4 glass">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={async () => {
            if (recording) { mediaRecorder.current?.stop(); setRecording(false); return }
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
              const mr = new MediaRecorder(stream)
              audioChunks.current = []
              mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data) }
              mr.onstop = async () => {
                const blob = new Blob(audioChunks.current, { type: 'audio/wav' })
                try { const r = await stt(blob); setInput(prev => prev + ' ' + r.data.text) } catch {}
                stream.getTracks().forEach(t => t.stop())
              }
              mr.start(); mediaRecorder.current = mr; setRecording(true)
            } catch {}
          }}
            className={`px-3 py-1.5 rounded-lg text-xs transition ${recording ? 'bg-danger text-white animate-pulse' : 'glass hover:bg-surface-2'}`}>
            {recording ? '\ud83d\udd34 Recording...' : '\ud83c\udfa4 STT'}
          </button>
          <button onClick={async () => {
            const last = [...messages].reverse().find(m => m.role === 'assistant')
            if (!last) return
            try { const r = await tts(last.content); setAudioUrl(URL.createObjectURL(r.data)) } catch {}
          }} className="px-3 py-1.5 rounded-lg glass hover:bg-surface-2 text-xs transition">
            {'\ud83d\udd0a TTS'}
          </button>
          {audioUrl && <audio src={audioUrl} controls className="h-8" />}
        </div>
        <div className="flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2.5 rounded-xl glass resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            rows={2} />
          <button onClick={sendMessage} disabled={streaming || !input.trim()}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary-hover text-white font-medium text-sm transition-all shadow-lg shadow-primary/20 disabled:opacity-50 self-end">
            {streaming ? '...' : '\u2192'}
          </button>
        </div>
      </div>
    </div>
  )
}
