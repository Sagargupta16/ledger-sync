import { useId } from 'react'
import { motion } from 'motion/react'

import { DURATION, EASING, TAP_FEEDBACK } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

export type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL'

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

const ranges: TimeRange[] = ['1M', '3M', '6M', '1Y', 'ALL']

export default function TimeRangeSelector({ value, onChange }: Readonly<TimeRangeSelectorProps>) {
  const activeId = useId()
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const transition = { duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }

  return (
    <div className="ledger-control flex min-w-0 max-w-full flex-wrap gap-1 rounded-lg border p-1" role="tablist" aria-label="Time range selector">
      {ranges.map((range) => (
        <motion.button
          key={range}
          type="button"
          role="tab"
          aria-selected={value === range}
          onClick={() => onChange(range)}
          className={cn(
            'relative isolate min-h-11 min-w-11 flex-auto touch-manipulation rounded-md px-2 py-1.5 text-center text-sm font-medium leading-5 whitespace-nowrap tabular-nums lg:pointer-fine:min-h-9',
            'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            value === range
              ? 'text-primary'
              : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground',
          )}
          whileTap={reduceMotion ? undefined : TAP_FEEDBACK}
          transition={transition}
        >
          {value === range && (
            <motion.span
              aria-hidden="true"
              layoutId={reduceMotion ? undefined : activeId}
              className="pointer-events-none absolute inset-0 rounded-md border border-primary/20 bg-primary/10"
              initial={false}
              transition={transition}
            />
          )}
          <span className="relative">{range}</span>
        </motion.button>
      ))}
    </div>
  )
}
