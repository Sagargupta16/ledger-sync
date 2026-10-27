import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useChat, type ClientTool, type UseChatOptions } from '@/components/chat/useChat'
import type { ChatMessage } from '@/lib/chatAdapters'
import { aiConfigService } from '@/services/api/aiConfig'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

import { CANVAS_SYSTEM_NOTE } from './canvasPrompt'
import { canvasStorageKey, loadCanvas, MAX_CANVAS_CHARTS, saveCanvas } from './canvasStorage'
import { parseChartArgs, type CanvasChart } from './chartSpec'
import { RENDER_CHART_TOOL } from './renderChartTool'

/** `demo`: AI is off in demo mode. `needs-key`: BYOK without a stored key. */
export type CanvasAvailability = 'ready' | 'demo' | 'needs-key'

export interface AiCanvas {
  availability: CanvasAvailability
  charts: readonly CanvasChart[]
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  ask: (prompt: string) => void
  stop: () => void
  clearChat: () => void
  removeChart: (id: string) => void
  clearCanvas: () => void
}

/**
 * Canvas state and its chat. The chat is the shared `useChat` loop with one
 * extra client tool, `render_chart`, whose valid calls land on the canvas
 * newest first; the canvas keeps the latest MAX_CANVAS_CHARTS.
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

  // The request each new chart came from, set when a send starts.
  const promptRef = useRef('')

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
        }
        setCharts((previous) => [chart, ...previous].slice(0, MAX_CANVAS_CHARTS))
        return { rendered: true, chart_id: chart.id }
      },
    }),
    [],
  )
  const chatOptions = useMemo<UseChatOptions>(
    () => ({ clientTools: [renderChart], systemNote: CANVAS_SYSTEM_NOTE }),
    [renderChart],
  )

  const { messages, isStreaming, error, send, stop, clear } = useChat(
    mode,
    aiConfig?.provider ?? null,
    aiConfig?.model ?? null,
    aiConfig?.region ?? null,
    chatOptions,
  )

  const ask = useCallback(
    (prompt: string) => {
      if (isStreaming) return
      promptRef.current = prompt
      send(prompt)
    },
    [isStreaming, send],
  )
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
    ask,
    stop,
    clearChat: clear,
    removeChart,
    clearCanvas,
  }
}
