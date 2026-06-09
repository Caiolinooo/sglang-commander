import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '../../stores'
import { Button } from '../ui/Button'
import { Switch } from '../ui/Switch'
import { Image, Mic, Square, Volume2, Send, Loader2, X } from 'lucide-react'
import { stt } from '../../api/endpoints'
import { toast } from '../ui/Toast'

interface ChatInputProps {
  onSendMessage: (text: string) => void
  onTtsTrigger: () => void
  audioUrl: string | null
}

export default function ChatInput({ onSendMessage, onTtsTrigger, audioUrl }: ChatInputProps) {
  const {
    streaming,
    imagePreview,
    setImageData,
    setImagePreview,
    recording,
    setRecording,
    ragEnabled,
    setRagEnabled
  } = useChatStore()

  const [input, setInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])

  const adjustHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }

  useEffect(() => {
    adjustHeight()
  }, [input])

  const handleImageUpload = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImageData(dataUrl)
      setImagePreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }, [setImageData, setImagePreview])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) handleImageUpload(file)
    }
  }, [handleImageUpload])

  const handleSend = () => {
    if (!input.trim() || streaming) return
    onSendMessage(input)
    setInput('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      audioChunks.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }
      mr.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/wav' })
        try {
          const r = await stt(blob)
          if (r.data.text) {
            setInput(prev => prev + (prev ? ' ' : '') + r.data.text)
          }
        } catch {
          toast.error("STT Speech recognition failed.")
        }
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      mediaRecorder.current = mr
      setRecording(true)
    } catch {
      toast.error("Microphone access denied or unavailable.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
    setRecording(false)
  }

  return (
    <div className="space-y-3">
      {imagePreview && (
        <div className="relative inline-block animate-fade-in">
          <img src={imagePreview} alt="Upload" className="h-16 w-16 object-cover rounded-lg border border-border" />
          <button 
            onClick={() => { setImageData(null); setImagePreview(null) }}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center cursor-pointer shadow-sm hover:bg-danger/80"
          >
            <X size={10} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border/80 rounded-xl px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <input 
            ref={fileInputRef} 
            type="file" 
            accept="image/*" 
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }} 
          />
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} className="h-8 gap-1.5 text-xs">
            <Image size={13} /> Upload Image
          </Button>

          <Button
            size="sm"
            variant={recording ? 'danger' : 'secondary'}
            onClick={recording ? stopRecording : startRecording}
            className="h-8 gap-1.5 text-xs"
          >
            {recording ? <Square size={13} className="animate-pulse" /> : <Mic size={13} />}
            {recording ? 'Stop Mic' : 'Speech to Text'}
          </Button>

          <Button size="sm" variant="secondary" onClick={onTtsTrigger} className="h-8 gap-1.5 text-xs">
            <Volume2 size={13} /> Speak Response
          </Button>

          {audioUrl && <audio src={audioUrl} controls className="h-7 max-w-[140px]" />}
        </div>

        <div className="flex items-center gap-4">
          <Switch 
            checked={ragEnabled} 
            onChange={setRagEnabled} 
            label="Enable RAG" 
            className="mb-0.5"
          />
        </div>
      </div>

      <div className="flex items-end gap-3 bg-surface-2 border border-border rounded-xl p-2 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-all shadow-sm">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Send prompt message... (Shift+Enter for line break, paste images directly)"
          className="flex-1 max-h-32 min-h-[44px] px-3 py-2.5 bg-transparent resize-none focus:outline-none text-sm text-text placeholder:text-text-muted"
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={streaming || !input.trim()}
          className="mb-1 rounded-lg h-9 w-10 p-0 shadow-sm"
        >
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
