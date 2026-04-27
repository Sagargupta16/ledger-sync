import { useState, useRef, useEffect } from 'react'

import { useQuery } from '@tanstack/react-query'
import { Send, Square, Trash2, Minus, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'

import type { ChatMessage as ChatMessageType } from '@/lib/chatAdapters'
import { aiUsageService, type UsageResponse } from '@/services/api/aiUsage'

import ChatMessage from './ChatMessage'

interface Props {
  messages: ChatMessageType[]
  isStreaming: boolean
  error: string | null
  onSend: (content: string) => void
  onStop: () => void
  onClear: () => void
  onMinimize: () => void
}

const SUGGESTIONS = [
  'How much did I spend last month?',
  'What are my top expense categories?',
  "What's my savings rate?",
]

export default function ChatPanel({
  messages,
  isStreaming,
  error,
  onSend,
  onStop,
  onClear,
  onMinimize,
}: Readonly<Props>) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') onMinimize()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-16 right-0 w-[calc(100vw-2rem)] max-w-[380px] max-h-[70vh] sm:max-h-[500px] glass rounded-2xl border border-border flex flex-col overflow-hidden shadow-2xl"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-app-green animate-pulse shrink-0" />
          <span className="text-sm font-medium text-white">AI Assistant</span>
          <UsageBadge />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onClear}
            className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Minimize"
          >
            <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Ask me anything about your finances.</p>
            <div className="mt-3 space-y-1.5">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSend(q)}
                  className="block w-full text-left text-xs text-primary/80 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={`${msg.role}-${i}`} message={msg} />
        ))}
      </div>

      {error && (
        <div className="mx-4 mb-2 px-3 py-2 bg-app-red/10 border border-app-red/20 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-app-red shrink-0 mt-0.5" />
          <p className="text-xs text-app-red">{error}</p>
        </div>
      )}

      <div className="p-3 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your finances..."
            rows={1}
            className="flex-1 resize-none bg-white/5 border border-border rounded-xl px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="p-2 rounded-xl bg-app-red/20 text-app-red hover:bg-app-red/30 transition-colors"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Compact usage chip in the chat header. Polls every 30s while the panel is
 * open so the count updates after each message round.
 *
 * Mode-aware:
 *   app_bedrock -> "· 3 / 10 left" (messages remaining today, the cap the
 *     server enforces)
 *   byok        -> "· 1.2k / 50k" (token count, user-configured optional cap)
 *
 * Hidden in BYOK when there's no usage AND no configured token cap (nothing
 * interesting to show a fresh user).
 */
function UsageBadge() {
  const { data } = useQuery<UsageResponse>({
    queryKey: ['ai-usage'],
    queryFn: () => aiUsageService.get(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  if (!data) return null

  if (data.mode === 'app_bedrock') {
    const used = data.messages_today
    const cap = data.limits.app_daily_messages
    const remaining = Math.max(cap - used, 0)
    const pct = cap > 0 ? used / cap : 0
    return (
      <span
        className={`text-[10px] font-mono ${usageTone(pct)} truncate`}
        title={`Today: ${used} of ${cap} messages. Resets midnight UTC.`}
      >
        · {remaining} / {cap} left
      </span>
    )
  }

  // BYOK -- token counts
  const today = data.today.total_tokens
  const daily = data.limits.daily
  if (today === 0 && daily === null) return null

  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
  const label = daily ? `${fmt(today)} / ${fmt(daily)}` : fmt(today)
  const pct = daily && daily > 0 ? today / daily : 0
  const todayStr = today.toLocaleString()
  const tooltip = daily
    ? `Today: ${todayStr} tokens of ${daily.toLocaleString()} daily limit`
    : `Today: ${todayStr} tokens`

  return (
    <span
      className={`text-[10px] font-mono ${usageTone(pct)} truncate`}
      title={tooltip}
    >
      · {label}
    </span>
  )
}

function usageTone(pct: number): string {
  if (pct > 1) return 'text-app-red'
  if (pct > 0.8) return 'text-app-yellow'
  return 'text-muted-foreground'
}
