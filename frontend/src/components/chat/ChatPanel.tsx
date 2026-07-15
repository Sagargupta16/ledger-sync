import { useState, useRef, useEffect } from 'react'

import { useQuery } from '@tanstack/react-query'
import {
  Send,
  Square,
  Trash2,
  Minus,
  AlertCircle,
  Sparkles,
  PieChart,
  Repeat2,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
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

/** Icon-led quick actions for the empty state (finance-specific, one per pillar). */
const SUGGESTIONS: ReadonlyArray<{ icon: LucideIcon; label: string; prompt: string }> = [
  {
    icon: PieChart,
    label: 'Break down my spending',
    prompt: 'What are my top expense categories this month, and how do they compare to last month?',
  },
  {
    icon: Repeat2,
    label: 'Review my recurring bills',
    prompt: 'List my recurring bills and subscriptions. Which ones grew recently?',
  },
  {
    icon: TrendingUp,
    label: 'Check my savings health',
    prompt: "What's my savings rate over the last 3 months, and is it trending up or down?",
  },
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
      role="dialog"
      aria-label="AI Assistant chat"
      className="glass absolute bottom-16 right-0 flex max-h-[70dvh] w-[calc(100vw-2rem)] max-w-[min(380px,calc(100vw-3rem))] flex-col overflow-hidden rounded-lg border border-border shadow-[var(--glass-shadow-strong)] sm:max-h-[500px]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-app-green animate-pulse shrink-0" />
          <span className="text-sm font-medium text-foreground">AI Assistant</span>
          <UsageBadge />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onClear}
            className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-[var(--overlay-5)] text-muted-foreground hover:text-foreground transition-colors"
            title="Clear chat"
            aria-label="Clear chat"
          >
            <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-[var(--overlay-5)] text-muted-foreground hover:text-foreground transition-colors"
            title="Minimize"
            aria-label="Minimize chat"
          >
            <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} aria-live="polite" aria-atomic="false" className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="flex h-full flex-col justify-between py-2">
            {/* Centered mark on a faint grid, echoing the workspace texture */}
            <div className="ledger-workspace-bg flex flex-1 items-center justify-center py-8">
              <div className="flex size-14 items-center justify-center rounded-full border border-[var(--hairline-2)] bg-[var(--overlay-2)] shadow-[var(--glass-shadow)]">
                <Sparkles className="size-6 text-primary" aria-hidden="true" />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Hey there!</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Ask me anything about your spending, recurring bills, savings, taxes, or
                  investments -- I read your ledger, so answers use your real numbers.
                </p>
              </div>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => onSend(s.prompt)}
                    className="ledger-control flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs font-medium text-foreground transition-colors"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--hairline-1)] bg-[var(--overlay-2)]">
                      <s.icon className="size-3.5 text-primary" aria-hidden="true" />
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={`${msg.role}-${i}`} message={msg} />
        ))}
      </div>

      {error && (
        <div role="alert" className="mx-4 mb-2 px-3 py-2 bg-app-red/10 border border-app-red/20 rounded-lg flex items-start gap-2">
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
            aria-label="Ask about your finances"
            rows={1}
            className="flex-1 resize-none bg-[var(--overlay-2)] border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center shrink-0 rounded-xl bg-app-red/20 text-app-red hover:bg-app-red/30 transition-colors"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              title={input.trim() ? 'Send message' : 'Type a message first'}
              aria-label="Send message"
              className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center shrink-0 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
