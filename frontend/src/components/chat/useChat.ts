import { useState, useRef, useCallback } from 'react'
import type { ChatMessage } from '@/lib/chatAdapters'
import { streamChat } from '@/lib/chatAdapters'
import { buildFinancialContext } from '@/lib/chatContext'
import { aiConfigService } from '@/services/api/aiConfig'
import { useAuthStore } from '@/store/authStore'

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
      setIsStreaming(true)

      const userMsg: ChatMessage = { role: 'user', content }
      const allMessages = [...messages, userMsg]
      setMessages([...allMessages, { role: 'assistant', content: '' }])

      try {
        const accessToken = useAuthStore.getState().accessToken
        const apiKey = provider === 'bedrock' ? (accessToken ?? '') : await aiConfigService.getKey()

        const now = Date.now()
        if (!contextRef.current || now - contextTimestamp.current > 5 * 60 * 1000) {
          contextRef.current = await buildFinancialContext()
          contextTimestamp.current = now
        }

        const controller = new AbortController()
        abortRef.current = controller

        await streamChat(provider, {
          model,
          systemPrompt: contextRef.current,
          messages: allMessages,
          apiKey,
          region: region ?? undefined,
          signal: controller.signal,
          onToken: (token) => {
            setMessages((prev) => {
              const updated = [...prev]
              const last = updated.at(-1)
              if (last?.role === 'assistant') {
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
    },
    [provider, model, region, isStreaming, messages],
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
