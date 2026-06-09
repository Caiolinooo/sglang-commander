import { useState } from 'react'
import { Bot, User, Brain, ChevronDown, ChevronRight, Wrench, Hash, Zap, Clock, Volume2 } from 'lucide-react'
import { cn } from '../ui/cn'
import type { Message } from '../../stores'

interface MessageBubbleProps {
  message: Message
  streaming: boolean
  isLast: boolean
  onTts: (text: string) => void
}

export default function MessageBubble({ message, streaming, isLast, onTts }: MessageBubbleProps) {
  const [expandedReasoning, setExpandedReasoning] = useState(false)
  const [expandedTools, setExpandedTools] = useState(false)

  const isUser = message.role === 'user'

  return (
    <div className={cn("flex gap-4 animate-slide-up", isUser ? "flex-row-reverse" : "flex-row")}>
      <div 
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-xs border border-border/80 text-xs font-bold",
          isUser ? "bg-primary text-white" : "bg-surface-2 text-text"
        )}
      >
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>

      <div className={cn("max-w-[78%] space-y-2", isUser ? "text-right" : "text-left")}>
        {message.reasoning_content && (
          <div className="text-left">
            <button 
              onClick={() => setExpandedReasoning(!expandedReasoning)}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors mb-1 font-semibold cursor-pointer"
            >
              {expandedReasoning ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <Brain size={11} className="text-violet-500 animate-pulse" />
              <span>Thought process ({message.reasoning_content.length} chars)</span>
            </button>
            {expandedReasoning && (
              <div className="text-xs text-text-muted font-serif italic bg-surface-2/65 rounded-xl p-3 border border-border whitespace-pre-wrap leading-relaxed">
                {message.reasoning_content}
              </div>
            )}
          </div>
        )}

        <div 
          className={cn(
            "rounded-2xl px-4 py-3 shadow-xs text-sm leading-relaxed whitespace-pre-wrap text-left inline-block",
            isUser
              ? "bg-primary text-white rounded-tr-none"
              : "bg-surface border border-border text-text rounded-tl-none"
          )}
        >
          {message.content || (streaming && isLast ? (
            <span className="flex items-center gap-1 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-100" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-200" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-300" />
            </span>
          ) : '')}
        </div>

        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="text-left mt-2">
            <button 
              onClick={() => setExpandedTools(!expandedTools)}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors font-semibold cursor-pointer"
            >
              {expandedTools ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <Wrench size={11} />
              <span>{message.tool_calls.length} tool calls triggered</span>
            </button>
            {expandedTools && (
              <div className="mt-1.5 space-y-1.5">
                {message.tool_calls.map((tc, j) => (
                  <div key={j} className="bg-surface-2 border border-border rounded-lg p-2.5 font-mono text-[10px] text-text-muted">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-primary font-bold">{tc.function.name}</span>
                      <span className="text-[9px] opacity-60">ID: {tc.id}</span>
                    </div>
                    <pre className="whitespace-pre-wrap bg-surface/50 p-2 rounded border border-border/40 max-h-36 overflow-y-auto leading-relaxed">
                      {tc.function.arguments}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isUser && message.content && (
          <div className="flex items-center gap-3 mt-1.5 ml-1 text-[9px] text-text-muted font-medium justify-start">
            <button 
              onClick={() => onTts(message.content)} 
              className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
              title="Speak message"
            >
              <Volume2 size={10} /> Speak
            </button>

            {message.metrics && (
              <>
                <span className="flex items-center gap-1" title="Tokens generated">
                  <Hash size={9} /> {message.metrics.tokensGenerated} tokens
                </span>
                <span className="flex items-center gap-1" title="Generation speed">
                  <Zap size={9} className="text-success" /> {message.metrics.tokensPerSec.toFixed(1)} tok/s
                </span>
                <span className="flex items-center gap-1" title="Total time">
                  <Clock size={9} /> {(message.metrics.elapsedMs / 1000).toFixed(2)}s
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
