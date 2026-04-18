import { useState, useRef, useCallback } from 'react'
import type { ChatMessage } from '@/lib/chatAdapters'
import { streamChat } from '@/lib/chatAdapters'
import { buildFinancialContext } from '@/lib/chatContext'
import { aiConfigService } from '@/services/api/aiConfig'

interface UseChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  send: (content: string) => void
  stop: () => void
  clear: () => void
}

export function useChat(
  provider: string | null,
  model: string | null,
  region: string | null,
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const contextRef = useRef<string | null>(null)
  const contextTimestamp = useRef(0)

  const send = useCallback(
    async (content: string) => {
      if (!provider || !model || isStreaming) return

      setError(null)
      const userMsg: ChatMessage = { role: 'user', content }

      setMessages((prev) => {
        const updated = [...prev, userMsg]
        doStream(updated, provider, model, region)
        return updated
      })

      async function doStream(
        allMessages: ChatMessage[],
        prov: string,
        mod: string,
        reg: string | null,
      ) {
        setIsStreaming(true)
        try {
          const apiKey = await aiConfigService.getKey()

          const now = Date.now()
          if (!contextRef.current || now - contextTimestamp.current > 5 * 60 * 1000) {
            contextRef.current = await buildFinancialContext()
            contextTimestamp.current = now
          }

          setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

          const controller = new AbortController()
          abortRef.current = controller

          await streamChat(prov, {
            model: mod,
            systemPrompt: contextRef.current,
            messages: allMessages,
            apiKey,
            region: reg ?? undefined,
            signal: controller.signal,
            onToken: (token) => {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + token }
                }
                return updated
              })
            },
            onDone: () => setIsStreaming(false),
            onError: (err) => {
              setError(err)
              setIsStreaming(false)
            },
          })
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Failed to send message')
          setIsStreaming(false)
        }
      }
    },
    [provider, model, region, isStreaming],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setIsStreaming(false)
    contextRef.current = null
  }, [])

  return { messages, isStreaming, error, send, stop, clear }
}
