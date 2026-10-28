import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Square } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'

import type { ProgressStep } from '../canvasSteps'

interface Props {
  readonly steps: readonly ProgressStep[]
  readonly startedAt: number
  readonly onStop: () => void
}

/** Placeholder bars, so the slot reads as a chart before one exists; the pulse ripples left to right. */
const BARS = [
  'h-[38%]',
  'h-[62%] [animation-delay:90ms]',
  'h-[48%] [animation-delay:180ms]',
  'h-[80%] [animation-delay:270ms]',
  'h-[56%] [animation-delay:360ms]',
  'h-[70%] [animation-delay:450ms]',
  'h-[44%] [animation-delay:540ms]',
  'h-[66%] [animation-delay:630ms]',
]

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000)
    return () => globalThis.clearInterval(timer)
  }, [])
  return Math.max(0, Math.round((now - startedAt) / 1000))
}

function StepIcon({ status }: Readonly<{ status: ProgressStep['status'] }>) {
  if (status === 'done') return <Check className="size-3.5 text-app-green" aria-hidden="true" />
  if (status === 'error') return <AlertCircle className="size-3.5 text-app-orange" aria-hidden="true" />
  return <Loader2 className="size-3.5 animate-spin text-app-blue" aria-hidden="true" />
}

/**
 * Stands where the next chart will land while a request runs: a chart-shaped
 * skeleton, each step in words as it runs and settles, the elapsed time, and
 * Stop. A step that errored is one the model is correcting, not a failure.
 */
export default function GeneratingCard({ steps, startedAt, onStop }: Props) {
  const seconds = useElapsedSeconds(startedAt)
  const done = steps.filter((step) => step.status !== 'running').length
  return (
    <motion.article
      layout
      variants={fadeUpItem}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, scale: 0.97 }}
      aria-busy="true"
      aria-label="Drawing your chart"
      className="ledger-panel flex min-w-0 flex-col gap-4 p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Drawing your chart</h2>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {done} of {steps.length} steps · {seconds}s
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onStop}
          title="Stop waiting. A call already sent still counts toward today's AI usage."
        >
          <Square className="size-3.5" aria-hidden="true" />
          Stop
        </Button>
      </header>

      <div className="flex h-36 items-end gap-2 border-b border-[var(--hairline-1)] px-1" aria-hidden="true">
        {BARS.map((bar) => (
          <div key={bar} className={`flex-1 animate-pulse rounded-t-sm bg-[var(--overlay-5)] ${bar}`} />
        ))}
      </div>

      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 shrink-0">
              <StepIcon status={step.status} />
            </span>
            <span className={step.status === 'running' ? 'text-foreground' : 'text-muted-foreground'}>
              {step.label}
              {step.status === 'error' && ' (retrying with corrected input)'}
            </span>
          </li>
        ))}
      </ol>
    </motion.article>
  )
}
