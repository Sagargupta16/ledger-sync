import { useCallback, useState } from 'react'

import type { ToolEvent } from '@/components/chat/useChat'

import {
  describeToolCall,
  isToolError,
  READING_STEP,
  WRITING_STEP,
  type ProgressStep,
  type StepStatus,
} from './canvasSteps'

const READING_ID = 0
const WRITING_ID = -1

function settle(steps: readonly ProgressStep[], id: number, status: StepStatus): ProgressStep[] {
  return steps.map((step) => (step.id === id && step.status === 'running' ? { ...step, status } : step))
}

export interface CanvasProgress {
  readonly steps: readonly ProgressStep[]
  readonly startedAt: number | null
  readonly begin: () => void
  readonly toolStarted: (event: ToolEvent) => void
  readonly toolEnded: (event: ToolEvent, result: unknown) => void
  readonly finish: () => void
}

/**
 * The live step list for one canvas request: reading the request, each tool
 * call in words as it runs and settles, then writing the takeaway once a chart
 * is drawn. Cleared when the request settles.
 */
export function useCanvasProgress(): CanvasProgress {
  const [steps, setSteps] = useState<ProgressStep[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)

  const begin = useCallback(() => {
    setSteps([{ id: READING_ID, label: READING_STEP, status: 'running' }])
    setStartedAt(Date.now())
  }, [])

  const toolStarted = useCallback((event: ToolEvent) => {
    setSteps((previous) => [
      ...settle(settle(previous, READING_ID, 'done'), WRITING_ID, 'done'),
      { id: event.id, label: describeToolCall(event.name, event.input), status: 'running' },
    ])
  }, [])

  const toolEnded = useCallback((event: ToolEvent, result: unknown) => {
    const failed = isToolError(result)
    setSteps((previous) => {
      const next = settle(previous, event.id, failed ? 'error' : 'done')
      if (event.name !== 'render_chart' || failed || next.some((step) => step.id === WRITING_ID)) return next
      return [...next, { id: WRITING_ID, label: WRITING_STEP, status: 'running' }]
    })
  }, [])

  const finish = useCallback(() => {
    setSteps([])
    setStartedAt(null)
  }, [])

  return { steps, startedAt, begin, toolStarted, toolEnded, finish }
}
