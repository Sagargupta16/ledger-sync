import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import type { Block, ChatMessage, ToolSpec } from '@/lib/chatAdapters'
import { sendChat } from '@/lib/chatAdapters'
import { buildFinancialContext } from '@/lib/chatContext'
import { executeTool, fetchTools } from '@/lib/chatTools'
import { getSessionSignal, isCurrentSession } from '@/lib/session'
import { aiConfigService, type AIMode } from '@/services/api/aiConfig'
import { aiUsageService } from '@/services/api/aiUsage'
import { useAuthStore } from '@/store/authStore'

/** Hard cap on tool-calling rounds per user message -- stops runaway loops. */
const MAX_TOOL_ROUNDS = 6

const EMPTY_REPLY_MESSAGE = 'The assistant returned an empty reply. Try rephrasing your question.'

/** Drop the in-flight assistant placeholder, which is always the trailing turn. */
function withoutPendingReply(prev: ChatMessage[]): ChatMessage[] {
  return prev.at(-1)?.role === 'assistant' ? prev.slice(0, -1) : prev
}

/** Replace the in-flight assistant placeholder's text. */
function withPendingReply(text: string) {
  return (prev: ChatMessage[]): ChatMessage[] =>
    prev.at(-1)?.role === 'assistant'
      ? [...prev.slice(0, -1), { role: 'assistant', content: text }]
      : prev
}

/**
 * A tool the browser runs itself instead of the server's `/api/ai/tools/execute`,
 * such as the AI Canvas's `render_chart`. Its result goes back to the model as
 * the tool_result.
 */
export interface ClientTool {
  spec: ToolSpec
  run: (input: Record<string, unknown>) => unknown
}

export interface UseChatOptions {
  /** Offered beside the server's tools; a call to one runs locally. */
  clientTools?: readonly ClientTool[]
  /** Appended to the system prompt for this chat only. */
  systemNote?: string
}

/** Run a requested tool: a matching client tool locally, anything else on the server. */
async function dispatchTool(
  clientTools: readonly ClientTool[],
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const local = clientTools.find((tool) => tool.spec.name === name)
  if (!local) return executeTool(name, input)
  try {
    return await local.run(input)
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'The tool failed' }
  }
}

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

/** The error to show for a failed send; null for an abort, which is not a failure. */
function sendErrorMessage(err: unknown): string | null {
  if (err instanceof DOMException && err.name === 'AbortError') return null
  return err instanceof Error ? err.message : 'Failed to send message'
}

/**
 * Refresh ['ai-usage'] (the chat badge and Settings) once a send has settled
 * and every usage log it posted has landed, unless the session that sent it
 * has ended. This is what keeps the badge current without polling.
 */
function refreshUsage(queryClient: QueryClient, signal: AbortSignal, usageLogs: Promise<void>[]): void {
  void Promise.allSettled(usageLogs).then(() => {
    if (isCurrentSession(signal)) void queryClient.invalidateQueries({ queryKey: ['ai-usage'] })
  })
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
  options?: UseChatOptions,
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Read when a send starts, so a caller's new options object never re-creates `send`.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  }, [options])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set only while a send is in flight; `stop` uses it to know a placeholder exists.
  const abortRef = useRef<AbortController | null>(null)
  // Bumped by every send, stop and clear so a superseded run publishes nothing.
  const runRef = useRef(0)
  const contextRef = useRef<string | null>(null)
  const contextTimestamp = useRef(0)
  const queryClient = useQueryClient()

  // Load tools once; they're static per deploy. Disabled until the user is
  // authed so anonymous browsing doesn't try to fetch.
  const accessToken = useAuthStore((s) => s.accessToken)
  const { data: tools } = useQuery<ToolSpec[]>({
    queryKey: ['ai-tools'],
    queryFn: fetchTools,
    enabled: !!accessToken,
    staleTime: Infinity,
  })

  const sendAsync = useCallback(
    async (content: string) => {
      if (isStreaming) return
      // BYOK requires a configured provider+model; app mode provides its own.
      if (mode === 'byok' && (!provider || !model)) return

      setError(null)
      setIsStreaming(true)

      const runId = ++runRef.current
      const isCurrent = () => runRef.current === runId
      // Created before any await so Stop works during credential/context loading.
      const controller = new AbortController()
      abortRef.current = controller
      // Also before any await: only the session that sent may refresh usage.
      const sessionSignal = getSessionSignal()
      const usageLogs: Promise<void>[] = []

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
        controller.signal.throwIfAborted()

        const clientTools = optionsRef.current?.clientTools ?? []
        const systemNote = optionsRef.current?.systemNote
        await runToolLoop({
          provider: resolved.provider,
          model: resolved.model,
          region: resolved.region,
          apiKey: resolved.apiKey,
          systemPrompt: systemNote ? `${contextRef.current}\n\n${systemNote}` : contextRef.current,
          conversation,
          tools: [...(tools ?? []), ...clientTools.map((tool) => tool.spec)],
          runTool: (name, input) => dispatchTool(clientTools, name, input),
          signal: controller.signal,
          usageLogs,
          onFinalText: (text) => {
            if (!isCurrent()) return
            if (text.trim()) {
              setMessages(withPendingReply(text))
            } else {
              // An empty turn would be dropped from the next request anyway;
              // say so instead of leaving a bubble that looks like it is loading.
              setMessages(withoutPendingReply)
              setError(EMPTY_REPLY_MESSAGE)
            }
          },
          // Show transient "Checking..." while tools execute
          onStatus: (status) => {
            if (isCurrent()) setMessages(withPendingReply(status))
          },
        })
      } catch (err: unknown) {
        // A stopped or cleared run was already tidied by stop()/clear().
        if (isCurrent()) {
          setMessages(withoutPendingReply)
          const message = sendErrorMessage(err)
          if (message !== null) setError(message)
        }
      } finally {
        if (isCurrent()) {
          abortRef.current = null
          setIsStreaming(false)
        }
        // A stopped or failed send can still have used quota, so refresh either way.
        refreshUsage(queryClient, sessionSignal, usageLogs)
      }
    },
    [mode, provider, model, region, isStreaming, messages, tools, queryClient],
  )

  // The public `send` is declared void-returning (ChatPanel's onSend prop), so
  // hand callers a void wrapper instead of a promise they would drop on the
  // floor. `sendAsync` catches every failure into `error`, which ChatPanel
  // renders, so nothing is silenced by not awaiting it.
  const send = useCallback((content: string) => void sendAsync(content), [sendAsync])

  const stop = useCallback(() => {
    const controller = abortRef.current
    setIsStreaming(false)
    if (!controller) return
    runRef.current += 1
    abortRef.current = null
    controller.abort()
    // A half-finished reply (or its "Looking up..." status) is not an answer.
    setMessages(withoutPendingReply)
  }, [])

  const clear = useCallback(() => {
    runRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
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
  /** Executes one tool_use: a client tool locally, otherwise through the server. */
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown>
  signal: AbortSignal
  /** Each round's usage log (browser-direct providers), so the usage refresh can wait for them. */
  usageLogs: Promise<void>[]
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
  // `convo` grows as the rounds run -- we mutate this local array, not the
  // React state, to avoid render-per-round and race conditions.
  const convo: ChatMessage[] = [...params.conversation]

  if (await runRounds(params, convo, MAX_TOOL_ROUNDS)) return

  // Fell off the round limit -- still show whatever the model last said. The
  // final message is the round's tool results (a user turn), so look back for
  // the last assistant turn instead of reading `convo.at(-1)`, which never
  // matched and left the bubble showing the last status line.
  const lastAssistant = convo.findLast((message) => message.role === 'assistant')
  params.onFinalText(
    (lastAssistant?.blocks ? textFromBlocks(lastAssistant.blocks) : '') ||
      `(Tool-calling stopped after ${MAX_TOOL_ROUNDS} rounds without a final answer.)`,
  )
}

/**
 * One send + tool-execution round per call. Rounds are chained, not looped:
 * each needs the previous round's tool results in `convo`, so they cannot run
 * concurrently. Resolves true once the model gives a final answer, false when
 * `roundsLeft` runs out first.
 */
async function runRounds(params: LoopParams, convo: ChatMessage[], roundsLeft: number): Promise<boolean> {
  if (roundsLeft <= 0) return false

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
  // and limit enforcement stay accurate. The send's usage refresh waits
  // for these; the chat itself does not.
  if (response.usage) {
    const logged = aiUsageService
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
    params.usageLogs.push(logged)
  }

  // Append the assistant turn (whatever mix of text + tool_use).
  convo.push({ role: 'assistant', blocks: response.blocks })

  const toolUses = response.blocks.filter(
    (b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use',
  )

  if (response.stopReason !== 'tool_use' || toolUses.length === 0) {
    params.onFinalText(textFromBlocks(response.blocks))
    return true
  }

  // Show a status hint while tools run (LLM often returns some text alongside
  // its tool request -- use that if available, otherwise a generic message).
  const interimText = textFromBlocks(response.blocks)
  params.onStatus(interimText || 'Looking up your data…')

  // A stopped send must not run tools, client tools included, after the fact.
  params.signal.throwIfAborted()

  // Execute all tool_use blocks in parallel and append the results as a
  // single user turn.
  const results = await Promise.all(
    toolUses.map(async (tu) => ({
      tool_use_id: tu.tool_use_id,
      content: await params.runTool(tu.name, tu.input),
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

  return runRounds(params, convo, roundsLeft - 1)
}
