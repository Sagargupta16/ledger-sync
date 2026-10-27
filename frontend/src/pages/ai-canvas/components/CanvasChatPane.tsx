import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, Send, Square, Trash2 } from 'lucide-react'

import ChatMessage from '@/components/chat/ChatMessage'
import { Button } from '@/components/ui'
import type { ChatMessage as ChatMessageData } from '@/lib/chatAdapters'
import { useMotionStore } from '@/store/motionStore'

interface Props {
  readonly messages: ChatMessageData[]
  readonly isStreaming: boolean
  readonly error: string | null
  readonly onSend: (prompt: string) => void
  readonly onStop: () => void
  readonly onClear: () => void
}

/**
 * The canvas's composer and conversation. On a phone the log folds behind a
 * toggle and the latest reply shows under the composer; from `xl` the log is
 * always open beside the canvas.
 */
export default function CanvasChatPane({ messages, isStreaming, error, onSend, onStop, onClear }: Props) {
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
    <section aria-label="Ask the assistant" className="ledger-panel flex flex-col gap-3 p-4 xl:max-h-[calc(100dvh-9rem)]">
      <form
        className="flex items-end gap-2"
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
          <Button type="button" variant="secondary" onClick={onStop} aria-label="Stop" title="Stop">
            <Square className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} aria-label="Send" title="Send">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        )}
      </form>

      {error && (
        <p role="alert" className="flex items-start gap-2 text-xs text-app-red">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
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
            aria-live="polite"
            className={`${logOpen ? 'flex' : 'hidden'} min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain xl:flex`}
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
