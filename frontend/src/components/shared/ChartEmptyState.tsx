import { motion } from 'motion/react'
import { BarChart3 } from 'lucide-react'

import { DURATION, EASING } from '@/constants/animations'
import { useMotionStore } from '@/store/motionStore'

interface ChartEmptyStateProps {
  readonly message?: string
  readonly height?: number
}

/**
 * Empty state placeholder for charts with no data.
 * Drop this inside a ResponsiveContainer or chart wrapper when data is empty.
 */
export default function ChartEmptyState({
  message = 'No data available for the selected period',
  height = 300,
}: ChartEmptyStateProps) {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const transition = { duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }

  return (
    <output
      aria-label="No data available for this chart"
      className="flex min-w-0 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--hairline-3)] bg-[var(--overlay-1)] p-4 text-center"
      style={{ height }}
    >
      <motion.span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--hairline-2)] bg-surface-1 text-text-tertiary"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={transition}
      >
        <BarChart3 className="size-5" strokeWidth={1.5} />
      </motion.span>
      <motion.span
        className="max-w-[32ch] text-pretty text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]"
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        {message}
      </motion.span>
    </output>
  )
}
