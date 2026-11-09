import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useChat, type ClientTool, type ToolEvent, type UseChatOptions } from '@/components/chat/useChat'
import { isAiReady, useAiAvailability, type AiAvailability } from '@/hooks/api/useAiAvailability'
import type { ChatMessage } from '@/lib/chatAdapters'
import { useAuthStore } from '@/store/authStore'

import { CALCULATE_TOOL } from './calculatorTool'
import { CANVAS_SYSTEM_NOTE } from './canvasPrompt'
import { describeToolCall, isToolError, type ProgressStep } from './canvasSteps'
import { canvasStorageKey, loadCanvas, MAX_CANVAS_CHARTS, saveCanvas } from './canvasStorage'
import { MAX_SOURCES, parseChartArgs, type CanvasChart } from './chartSpec'
import { RENDER_CHART_TOOL } from './renderChartTool'
import { useCanvasProgress } from './useCanvasProgress'

/**
 * A chart's "How this was made" list: this request's look-ups. With none, the
 * model drew from results already in the conversation, which is all that can
 * be said truthfully; an estimate has no look-ups, its badge and note explain it.
 */
function sourcesFor(current: readonly string[], source: CanvasChart['spec']['source']): string[] {
  if (current.length > 0) return current.slice(0, MAX_SOURCES)
  return source === 'estimate' ? [] : ['Used results already in this conversation']
}

/**
 * `loading` and `error`: the AI settings are not known yet, so nothing may be sent.
 * `demo`: AI is off in demo mode. `needs-key`: BYOK without a stored key.
 * `incomplete`: BYOK with a key but no provider or model.
 */
export type CanvasAvailability = 'loading' | 'error' | 'ready' | 'demo' | 'needs-key' | 'incomplete'

const CANVAS_AVAILABILITY: Record<AiAvailability['kind'], CanvasAvailability> = {
  loading: 'loading',
  error: 'error',
  demo: 'demo',
  app: 'ready',
  byok_needs_key: 'needs-key',
  byok_incomplete: 'incomplete',
  byok_ready: 'ready',
}

export interface AiCanvas {
  availability: CanvasAvailability
  /** Refetches the AI settings after they failed to load; null otherwise. */
  retryConfig: (() => void) | null
  charts: readonly CanvasChart[]
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  /** The current request's steps, and when it was sent; empty and null when idle. */
  steps: readonly ProgressStep[]
  startedAt: number | null
  ask: (prompt: string) => void
  /** Send the last request again, after a failure. */
  retry: () => void
  stop: () => void
  clearChat: () => void
  removeChart: (id: string) => void
  clearCanvas: () => void
}

/**
 * Canvas state and its chat. The chat is the shared `useChat` loop with one
 * extra client tool, `render_chart`, whose valid calls land on the canvas
 * newest first, each with the data look-ups that preceded it; the canvas keeps
 * the latest MAX_CANVAS_CHARTS.
 */
export function useAiCanvas(): AiCanvas {
  const userId = useAuthStore((s) => s.user?.id ?? null)

  // The one availability derivation, shared with ChatWidget: an unknown config never means app mode.
  const aiAvailability = useAiAvailability()
  const byok = aiAvailability.kind === 'byok_ready' ? aiAvailability : null

  // The authenticated layout is keyed by identity, so the key cannot change under this page.
  const storageKey = canvasStorageKey(userId)
  const [charts, setCharts] = useState<CanvasChart[]>(() => loadCanvas(storageKey))
  useEffect(() => saveCanvas(storageKey, charts), [storageKey, charts])

  const progress = useCanvasProgress()
  // The request each new chart came from, and the look-ups made for it so far.
  const promptRef = useRef('')
  const sourcesRef = useRef<string[]>([])

  const renderChart = useMemo<ClientTool>(
    () => ({
      spec: RENDER_CHART_TOOL,
      run: (input) => {
        const parsed = parseChartArgs(input)
        if (!parsed.ok) {
          return { error: `${parsed.error}. Fix the arguments and call render_chart again.` }
        }
        const chart: CanvasChart = {
          id: crypto.randomUUID(),
          spec: parsed.spec,
          prompt: promptRef.current,
          createdAt: new Date().toISOString(),
          sources: sourcesFor(sourcesRef.current, parsed.spec.source),
        }
        setCharts((previous) => [chart, ...previous].slice(0, MAX_CANVAS_CHARTS))
        return { rendered: true, chart_id: chart.id }
      },
    }),
    [],
  )
  const { toolStarted, toolEnded } = progress
  const chatOptions = useMemo<UseChatOptions>(
    () => ({
      clientTools: [renderChart, CALCULATE_TOOL],
      systemNote: CANVAS_SYSTEM_NOTE,
      onToolStart: toolStarted,
      onToolEnd: (event: ToolEvent, result: unknown) => {
        toolEnded(event, result)
        const label = describeToolCall(event.name, event.input)
        if (event.name !== 'render_chart' && !isToolError(result) && !sourcesRef.current.includes(label)) {
          sourcesRef.current = [...sourcesRef.current, label]
        }
      },
    }),
    [renderChart, toolStarted, toolEnded],
  )

  const { messages, isStreaming, error, send, stop, clear } = useChat(
    byok ? 'byok' : 'app_bedrock',
    byok?.provider ?? null,
    byok?.model ?? null,
    byok?.region ?? null,
    chatOptions,
  )

  // Leaving the page ends the request instead of letting its remaining rounds run unseen.
  useEffect(() => stop, [stop])

  const { begin, finish } = progress
  useEffect(() => {
    if (!isStreaming) finish()
  }, [isStreaming, finish])

  const ask = useCallback(
    (prompt: string) => {
      if (isStreaming) return
      promptRef.current = prompt
      // Only a known, usable config may send; the page shows the other states instead of a composer.
      if (!isAiReady(aiAvailability)) return
      sourcesRef.current = []
      begin()
      send(prompt)
    },
    [isStreaming, aiAvailability, send, begin],
  )
  const retry = useCallback(() => {
    if (promptRef.current) ask(promptRef.current)
  }, [ask])
  const removeChart = useCallback((id: string) => {
    setCharts((previous) => previous.filter((chart) => chart.id !== id))
  }, [])
  const clearCanvas = useCallback(() => setCharts([]), [])

  const availability = CANVAS_AVAILABILITY[aiAvailability.kind]

  return {
    availability,
    retryConfig: aiAvailability.kind === 'error' ? aiAvailability.retry : null,
    charts,
    messages,
    isStreaming,
    error,
    steps: progress.steps,
    startedAt: progress.startedAt,
    ask,
    retry,
    stop,
    clearChat: clear,
    removeChart,
    clearCanvas,
  }
}
