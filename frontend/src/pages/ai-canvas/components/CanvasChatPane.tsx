import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, RotateCcw, Send, Square, Trash2 } from 'lucide-react'

import ChatMessage from '@/components/chat/ChatMessage'
import { Button } from '@/components/ui'
import type { ChatMessage as ChatMessageData } from '@/lib/chatAdapters'
import { useMotionStore } from '@/store/motionStore'

interface Props {
  readonly messages: ChatMessageData[]
  readonly isStreaming: boolean
  readonly error: string | null
  readonly onSend: (prompt: string) => void
  readonly onRetry: () => void
  readonly onStop: () => void
  readonly onClear: () => void
}

/**
 * The canvas's conversation and composer. On a phone the composer comes first,
 * the log folds behind a toggle and the latest reply shows under it; from `xl`
 * the log is always open and the composer sits at its foot, as in a chat.
 */
export default function CanvasChatPane({ messages, isStreaming, error, onSend, onRetry, onStop, onClear }: Props) {
  const [input, setInput] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const motionMode = useMotionStore((state) => state.mode)
  const logRef = useRef<HTMLDivElement>(null)
  const latestReply = messages.findLast((message) => message.role === 'assistant')

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: motionMode === 'reduced' ? 'auto' : 'smooth',
    })
  }, [messages, motionMode])

  const submit = () => {
    const prompt = input.trim()
    if (!prompt || isStreaming) return
    onSend(prompt)
    setInput('')
  }

  return (
    <section aria-label="Ask the assistant" className="ledger-panel flex flex-col gap-3 p-4 xl:h-full">
      <form
        className="flex items-end gap-2 xl:order-last"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label htmlFor="ai-canvas-prompt" className="sr-only">
          Describe the chart you want
        </label>
        <textarea
          id="ai-canvas-prompt"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Chart my monthly spending on food this year"
          className="ledger-control min-h-11 min-w-0 flex-1 resize-none rounded-md border px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:text-sm"
        />
        {isStreaming ? (
          <Button type="button" variant="secondary" onClick={onStop} aria-label="Stop" title="Stop waiting">
            <Square className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} aria-label="Send" title="Send">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        )}
      </form>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-2 rounded-md border border-[var(--hairline-1)] p-2 text-xs xl:order-last">
          <p className="flex items-start gap-2 text-app-red">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={onRetry} disabled={isStreaming}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {messages.length === 0 && (
        // The full-height column on wide screens says what it is for before the first request.
        <div className="hidden flex-1 flex-col justify-end gap-2 text-xs text-muted-foreground xl:flex">
          <p className="font-medium text-foreground">Ask for any chart</p>
          <p>
            Your data, a calculation such as a SIP or loan schedule, or outside figures you name. Each answer
            lands on the canvas with where its numbers came from, and follow-ups build on what is already
            drawn.
          </p>
        </div>
      )}

      {messages.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLogOpen((open) => !open)}
              aria-expanded={logOpen}
              aria-controls="ai-canvas-log"
              className="xl:hidden"
            >
              Conversation ({messages.length})
              <ChevronDown className={`size-3.5 transition-transform ${logOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </Button>
            <span className="hidden text-xs font-medium text-muted-foreground xl:inline">Conversation</span>
            <Button type="button" variant="ghost" size="sm" onClick={onClear} title="Clear conversation">
              <Trash2 className="size-3.5" aria-hidden="true" />
              Clear
            </Button>
          </div>
          {!logOpen && latestReply && (
            <div className="xl:hidden">
              <ChatMessage message={latestReply} />
            </div>
          )}
          <div
            id="ai-canvas-log"
            ref={logRef}
            role="log"
            className={`${logOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain xl:flex`}
          >
            {/* Messages only ever append or clear, so the index is a stable key. */}
            {messages.map((message, index) => (
              <ChatMessage key={`${message.role}-${index}`} message={message} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
