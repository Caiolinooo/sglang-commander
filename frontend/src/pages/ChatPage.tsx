import { useEffect, useState, useRef } from 'react'
import { useChatStore, useServerStore } from '../stores'
import { tts } from '../api/endpoints'
import { MessageSquare, FileJson, Brain } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import MessageBubble from '../components/chat/MessageBubble'
import ChatInput from '../components/chat/ChatInput'
import ConversationSidebar from '../components/chat/ConversationSidebar'
import PromptTemplateSelector from '../components/chat/PromptTemplateSelector'

export default function ChatPage() {
  const {
    messages,
    streaming,
    model,
    setModel,
    temp,
    setTemp,
    jsonMode,
    setJsonMode,
    thinkingMode,
    setThinkingMode,
    error,
    sendMessage,
    fetchConversations,
    newConversation,
    conversations
  } = useChatStore()

  const { status, fetchStatus } = useServerStore()
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchConversations()
    fetchStatus()
  }, [])

  useEffect(() => {
    // If conversations are loaded and none is active, start a new one automatically
    if (conversations.length === 0) {
      newConversation()
    }
  }, [conversations])

  useEffect(() => {
    // Auto-fill active model from server status
    if (status.model_path) {
      const parts = status.model_path.split('/')
      setModel(parts[parts.length - 1] || status.model_path)
    }
  }, [status.model_path])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleTts = async (text: string) => {
    try {
      const r = await tts(text)
      setAudioUrl(URL.createObjectURL(r.data))
    } catch {}
  }

  const handleTtsLastResponse = async () => {
    const last = [...messages].reverse().find(m => m.role === 'assistant')
    if (last) {
      handleTts(last.content)
    }
  }

  const handleSelectSystemPrompt = (promptText: string) => {
    // Inject preset instructions into conversation
    sendMessage(promptText)
  }

  return (
    <div className="flex h-full animate-in">
      <ConversationSidebar />

      <div className="flex-1 flex flex-col h-full bg-bg relative">
        <div className="px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-4 shadow-xs z-10">
          <div className="flex items-center gap-2 text-text font-bold text-base">
            <MessageSquare className="h-5 w-5 text-primary" />
            Playground Chat
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-muted">Target Model</span>
              <Input
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-48 h-8 text-xs bg-bg font-mono"
                placeholder="Auto-detecting..."
              />
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-muted">Temp</span>
              <Input
                type="number"
                min={0} max={2} step={0.1}
                value={temp}
                onChange={e => setTemp(parseFloat(e.target.value) || 0.7)}
                className="w-16 h-8 text-xs bg-bg text-center font-mono"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Button 
                size="sm" 
                variant={jsonMode ? 'primary' : 'secondary'} 
                onClick={() => setJsonMode(!jsonMode)}
                className="gap-1 h-7 text-xs font-semibold" 
                title="Force JSON schema output format"
              >
                <FileJson size={12} /> JSON Mode
              </Button>
              <Button 
                size="sm" 
                variant={thinkingMode ? 'primary' : 'secondary'} 
                onClick={() => setThinkingMode(!thinkingMode)}
                className="gap-1 h-7 text-xs font-semibold" 
                title="Deepseek-R1 Thinking tokens extraction"
              >
                <Brain size={12} /> Deep Think
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs font-medium">
            Error details: {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length <= 1 && (
              <div className="py-4">
                <PromptTemplateSelector 
                  onSelect={handleSelectSystemPrompt} 
                  currentPrompt="" 
                />
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                streaming={streaming}
                isLast={i === messages.length - 1}
                onTts={handleTts}
              />
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="border-t border-border bg-surface p-4">
          <div className="max-w-3xl mx-auto">
            <ChatInput 
              onSendMessage={sendMessage} 
              onTtsTrigger={handleTtsLastResponse} 
              audioUrl={audioUrl} 
            />
          </div>
        </div>
      </div>
    </div>
  )
}
