import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { Block, ChatMessage, ToolSpec } from '@/lib/chatAdapters'
import { sendChat } from '@/lib/chatAdapters'
import { buildFinancialContext } from '@/lib/chatContext'
import { executeTool, fetchTools } from '@/lib/chatTools'
import { aiConfigService, type AIMode } from '@/services/api/aiConfig'
import { aiUsageService } from '@/services/api/aiUsage'
import { useAuthStore } from '@/store/authStore'

/** Hard cap on tool-calling rounds per user message -- stops runaway loops. */
const MAX_TOOL_ROUNDS = 6

interface UseChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  send: (content: string) => void
  stop: () => void
  clear: () => void
}

/**
 * Extract the last assistant text from a list of content blocks, joining
 * multiple text blocks into one string. Tool_use blocks are ignored -- the
 * UI renders them separately (or hides them).
 */
function textFromBlocks(blocks: Block[]): string {
  return blocks
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

interface ResolvedCredentials {
  provider: string
  model: string
  region: string | null
  apiKey: string
}

/**
 * Map user-visible mode/provider/model/region to the concrete values that
 * `sendChat` expects. In app_bedrock we force provider=bedrock and use a
 * placeholder model (the backend ignores it and picks the configured
 * default). In BYOK we trust the user's selections and fetch the stored
 * API key for browser-direct providers.
 *
 * Extracted from `useChat.send` to keep that callback's cognitive
 * complexity under the Sonar threshold.
 */
async function resolveCredentials(
  mode: AIMode,
  provider: string | null,
  model: string | null,
  region: string | null,
): Promise<ResolvedCredentials> {
  if (mode === 'app_bedrock') {
    return {
      provider: 'bedrock',
      model: 'app-default',
      region: null,
      apiKey: useAuthStore.getState().accessToken ?? '',
    }
  }
  // BYOK path: provider/model validated by the caller, so `!` is safe.
  const p = provider!
  const m = model!
  const apiKey =
    p === 'bedrock'
      ? useAuthStore.getState().accessToken ?? ''
      : await aiConfigService.getKey()
  return { provider: p, model: m, region, apiKey }
}

export function useChat(
  mode: AIMode,
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

  // Load tools once; they're static per deploy. Disabled until the user is
  // authed so anonymous browsing doesn't try to fetch.
  const accessToken = useAuthStore((s) => s.accessToken)
  const { data: tools } = useQuery<ToolSpec[]>({
    queryKey: ['ai-tools'],
    queryFn: fetchTools,
    enabled: !!accessToken,
    staleTime: Infinity,
  })

  const send = useCallback(
    async (content: string) => {
      if (isStreaming) return
      // BYOK requires a configured provider+model; app mode provides its own.
      if (mode === 'byok' && (!provider || !model)) return

      setError(null)
      setIsStreaming(true)

      const userMsg: ChatMessage = { role: 'user', content }
      const conversation: ChatMessage[] = [...messages, userMsg]
      // Optimistic empty assistant turn so the UI shows "processing..."
      setMessages([...conversation, { role: 'assistant', content: '' }])

      try {
        const resolved = await resolveCredentials(mode, provider, model, region)

        const now = Date.now()
        if (!contextRef.current || now - contextTimestamp.current > 5 * 60 * 1000) {
          contextRef.current = await buildFinancialContext()
          contextTimestamp.current = now
        }

        const controller = new AbortController()
        abortRef.current = controller

        await runToolLoop({
          provider: resolved.provider,
          model: resolved.model,
          region: resolved.region,
          apiKey: resolved.apiKey,
          systemPrompt: contextRef.current,
          conversation,
          tools: tools ?? [],
          signal: controller.signal,
          onFinalText: (text) => {
            setMessages((prev) => {
              const updated = [...prev]
              const last = updated.at(-1)
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { role: 'assistant', content: text }
              }
              return updated
            })
          },
          onStatus: (status) => {
            // Show transient "Checking..." while tools execute
            setMessages((prev) => {
              const updated = [...prev]
              const last = updated.at(-1)
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { role: 'assistant', content: status }
              }
              return updated
            })
          },
        })
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // user stopped; leave message as-is
        } else {
          setError(err instanceof Error ? err.message : 'Failed to send message')
        }
      } finally {
        setIsStreaming(false)
      }
    },
    [mode, provider, model, region, isStreaming, messages, tools],
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

// ---------------------------------------------------------------------------

interface LoopParams {
  provider: string
  model: string
  region: string | null
  apiKey: string
  systemPrompt: string
  conversation: ChatMessage[]
  tools: ToolSpec[]
  signal: AbortSignal
  onFinalText: (text: string) => void
  onStatus: (status: string) => void
}

/**
 * Drives the tool-calling loop:
 *   send -> if tool_use, execute tools -> append tool_result -> send again
 *   repeat until end_turn or MAX_TOOL_ROUNDS, whichever first.
 *
 * The caller only sees the final assistant text via `onFinalText`.
 */
async function runToolLoop(params: LoopParams): Promise<void> {
  // `convo` grows as the loop runs -- we mutate this local array, not the
  // React state, to avoid render-per-round and race conditions.
  const convo: ChatMessage[] = [...params.conversation]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await sendChat(params.provider, {
      model: params.model,
      systemPrompt: params.systemPrompt,
      messages: convo,
      apiKey: params.apiKey,
      region: params.region ?? undefined,
      tools: params.tools.length > 0 ? params.tools : undefined,
      signal: params.signal,
    })

    // Report usage back to our server. For Bedrock the backend already
    // logged it (usage === null) so we skip; for OpenAI/Anthropic we post
    // the provider-reported token counts so the user's usage dashboard
    // and limit enforcement stay accurate.
    if (response.usage) {
      aiUsageService
        .log({
          provider: params.provider,
          model: params.model,
          input_tokens: response.usage.inputTokens,
          output_tokens: response.usage.outputTokens,
          tool_rounds: 1,
        })
        .catch((err: unknown) => {
          // Usage logging is best-effort -- never fail the chat over it.
          console.warn('[useChat] failed to log usage:', err)
        })
    }

    // Append the assistant turn (whatever mix of text + tool_use).
    convo.push({ role: 'assistant', blocks: response.blocks })

    const toolUses = response.blocks.filter(
      (b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use',
    )

    if (response.stopReason !== 'tool_use' || toolUses.length === 0) {
      params.onFinalText(textFromBlocks(response.blocks))
      return
    }

    // Show a status hint while tools run (LLM often returns some text alongside
    // its tool request -- use that if available, otherwise a generic message).
    const interimText = textFromBlocks(response.blocks)
    params.onStatus(interimText || 'Looking up your data…')

    // Execute all tool_use blocks in parallel and append the results as a
    // single user turn.
    const results = await Promise.all(
      toolUses.map(async (tu) => ({
        tool_use_id: tu.tool_use_id,
        content: await executeTool(tu.name, tu.input),
      })),
    )
    convo.push({
      role: 'user',
      blocks: results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.tool_use_id,
        content: r.content,
      })),
    })
  }

  // Fell off the loop limit -- still show whatever the model last said.
  const lastAssistant = convo.at(-1)
  if (lastAssistant?.role === 'assistant' && lastAssistant.blocks) {
    params.onFinalText(
      textFromBlocks(lastAssistant.blocks) ||
        `(Tool-calling stopped after ${MAX_TOOL_ROUNDS} rounds without a final answer.)`,
    )
  }
}
