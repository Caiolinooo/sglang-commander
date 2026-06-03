import { useState, useRef, useEffect } from 'react'
import { tts, stt } from '../api/endpoints'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I\'m your SGLang model. Send a message to start chatting.' }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [model, setModel] = useState('default')
  const [temp, setTemp] = useState(0.7)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [sttLang, setSttLang] = useState('')
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return

    const userMsg: Message = { role: 'user', content: input }
    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    try {
      const resp = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          model,
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          temperature: temp,
          max_tokens: 4096,
          stream: true,
        }),
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
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  last.content += content
                }
                return updated
              })
            } catch { /* continue */ }
          }
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.role === 'assistant' && !last.content) {
          last.content = `Error: ${e}`
        }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-br-sm'
                : 'bg-surface border border-border rounded-bl-sm'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="border-t border-border p-4 bg-surface">
        <div className="flex items-center gap-2 mb-3">
          <input value={model} onChange={(e) => setModel(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Model name" />
          <div className="flex items-center gap-2 text-sm">
            <label className="text-text-muted">Temp:</label>
            <input type="number" min={0} max={2} step={0.1} value={temp}
              onChange={(e) => setTemp(parseFloat(e.target.value))}
              className="w-16 px-2 py-1 bg-bg border border-border rounded text-white text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={async () => {
              if (recording) {
                mediaRecorder.current?.stop()
                setRecording(false)
              } else {
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                  const mr = new MediaRecorder(stream)
                  audioChunks.current = []
                  mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data) }
                  mr.onstop = async () => {
                    const blob = new Blob(audioChunks.current, { type: 'audio/wav' })
                    try {
                      const r = await stt(blob, sttLang || undefined)
                      setInput(prev => prev + ' ' + r.data.text)
                    } catch (e) { console.error('STT failed:', e) }
                    stream.getTracks().forEach(t => t.stop())
                  }
                  mr.start()
                  mediaRecorder.current = mr
                  setRecording(true)
                } catch (e) { console.error('Mic access denied:', e) }
              }
            }}
            className={`px-3 py-1.5 rounded text-sm transition ${recording ? 'bg-red-600 text-white animate-pulse' : 'bg-surface-2 text-text-muted hover:text-white'}`}
            title={recording ? 'Stop recording' : 'Record audio (STT)'}
          >
            🎤 {recording ? 'Recording...' : 'Record'}
          </button>
          <input value={sttLang} onChange={e => setSttLang(e.target.value)}
            placeholder="Lang (en, pt...)"
            className="w-24 px-2 py-1.5 bg-bg border border-border rounded text-white text-sm" />
          {audioUrl && (
            <div className="flex items-center gap-2">
              <audio src={audioUrl} controls className="h-8" />
              <button onClick={() => setAudioUrl(null)} className="text-red-400 text-xs">✕</button>
            </div>
          )}
          <div className="flex-1" />
          <button onClick={async () => {
            if (!messages.length) return
            const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
            if (!lastAssistant) return
            try {
              const r = await tts(lastAssistant.content)
              const url = URL.createObjectURL(r.data)
              setAudioUrl(url)
            } catch (e) { console.error('TTS failed:', e) }
          }} className="px-3 py-1.5 bg-surface-2 text-text-muted hover:text-white rounded text-sm transition" title="Read last response aloud">
            🔊 TTS
          </button>
        </div>
        <div className="flex gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            rows={2} />
          <button onClick={sendMessage} disabled={streaming || !input.trim()}
            className="px-6 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg transition self-end">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
