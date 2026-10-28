import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useChat, type ClientTool, type ToolEvent, type UseChatOptions } from '@/components/chat/useChat'
import type { ChatMessage } from '@/lib/chatAdapters'
import { aiConfigService } from '@/services/api/aiConfig'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

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

/** `demo`: AI is off in demo mode. `needs-key`: BYOK without a stored key. */
export type CanvasAvailability = 'ready' | 'demo' | 'needs-key'

export interface AiCanvas {
  availability: CanvasAvailability
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
  const accessToken = useAuthStore((s) => s.accessToken)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isDemoMode = useDemoStore((s) => s.isDemoMode)

  // Same query and key as ChatWidget, so the two share one cached config.
  const { data: aiConfig } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigService.getConfig(),
    enabled: !!accessToken && !isDemoMode,
    staleTime: Infinity,
  })
  const mode = aiConfig?.mode ?? 'app_bedrock'

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
    mode,
    aiConfig?.provider ?? null,
    aiConfig?.model ?? null,
    aiConfig?.region ?? null,
    chatOptions,
  )

  const { begin, finish } = progress
  useEffect(() => {
    if (!isStreaming) finish()
  }, [isStreaming, finish])

  const ask = useCallback(
    (prompt: string) => {
      if (isStreaming) return
      promptRef.current = prompt
      sourcesRef.current = []
      begin()
      send(prompt)
    },
    [isStreaming, send, begin],
  )
  const retry = useCallback(() => {
    if (promptRef.current) ask(promptRef.current)
  }, [ask])
  const removeChart = useCallback((id: string) => {
    setCharts((previous) => previous.filter((chart) => chart.id !== id))
  }, [])
  const clearCanvas = useCallback(() => setCharts([]), [])

  let availability: CanvasAvailability = 'ready'
  if (isDemoMode) availability = 'demo'
  else if (mode === 'byok' && aiConfig?.has_key !== true) availability = 'needs-key'

  return {
    availability,
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
