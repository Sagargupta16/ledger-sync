import type { ReactNode } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { DURATION, EASING } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

/**
 * The in-place "updating" cue for a period change (see `useStablePeriodData`).
 *
 * Render `PeriodSettlingBar` as the last child of the page's `StickyToolbar`:
 * the toolbar is `position: sticky`, so the absolutely positioned bar rides its
 * bottom edge without adding height, and stays in view however far the reader
 * has scrolled. Wrap the period-driven content below the toolbar in
 * `PeriodSettlingContent`, which dims the previous snapshot while the next one
 * loads and keeps the column's section rhythm.
 *
 * Motion follows the in-app motion store, never the OS setting: the sweep runs
 * in full mode; in reduced mode the bar is a static stripe (the MotionConfig
 * skip would otherwise park the sweep off-screen) and the dim is instant.
 */
export function PeriodSettlingBar({ active }: Readonly<{ active: boolean }>) {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {active ? 'Updating figures for the selected period' : ''}
      </span>
      <AnimatePresence>
        {active && (
          <motion.span
            key="period-settling-bar"
            aria-hidden="true"
            data-period-settling=""
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-app-blue/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.quick }}
          >
            {reduceMotion ? (
              <span className="absolute inset-0 bg-app-blue/70" />
            ) : (
              <motion.span
                className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-app-blue"
                initial={{ x: '-100%' }}
                animate={{ x: '250%' }}
                transition={{ duration: 1.1, ease: EASING.smooth, repeat: Infinity }}
              />
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </>
  )
}

interface PeriodSettlingContentProps {
  readonly settling: boolean
  readonly children: ReactNode
  /** Section rhythm; match the `PageContainer` column this replaces. */
  readonly className?: string
}

export function PeriodSettlingContent({ settling, children, className }: PeriodSettlingContentProps) {
  return (
    <div
      aria-busy={settling || undefined}
      data-settling={settling ? '' : undefined}
      className={cn(
        'space-y-5 md:space-y-6 transition-opacity duration-200 ease-[var(--ease-cinematic)]',
        settling && 'opacity-60',
        className,
      )}
    >
      {children}
    </div>
  )
}
