import { Link } from 'react-router-dom'

import { CalendarClock, CircleCheck, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { ROUTES } from '@/constants'

import type { FreshnessAssessment, FreshnessLevel } from '../types'

interface StalenessBannerProps {
  readonly freshness: FreshnessAssessment
}

/**
 * Tone per freshness level. `critical` uses the expense/danger token because at
 * that point the numbers on every other page are wrong, not merely dated.
 */
const LEVEL_STYLES: Record<
  FreshnessLevel,
  { readonly container: string; readonly icon: string; readonly cta: string }
> = {
  fresh: {
    container: 'border-app-green/30 bg-app-green/10',
    icon: 'text-app-green',
    cta: 'border-app-green/40 text-app-green hover:bg-app-green/15',
  },
  aging: {
    container: 'border-app-blue/30 bg-app-blue/10',
    icon: 'text-app-blue',
    cta: 'border-app-blue/40 text-app-blue hover:bg-app-blue/15',
  },
  stale: {
    container: 'border-warning/30 bg-warning/10',
    icon: 'text-warning',
    cta: 'border-warning/40 text-warning hover:bg-warning/15',
  },
  critical: {
    container: 'border-app-red/40 bg-app-red/10',
    icon: 'text-app-red',
    cta: 'border-app-red/50 text-app-red hover:bg-app-red/15',
  },
}

const LEVEL_ICON: Record<FreshnessLevel, LucideIcon> = {
  fresh: CircleCheck,
  aging: CalendarClock,
  stale: CalendarClock,
  critical: TriangleAlert,
}

const LEVEL_TITLE: Record<FreshnessLevel, string> = {
  fresh: 'Ledger is up to date',
  aging: 'Ledger is a few days behind',
  stale: 'Ledger is out of date',
  critical: 'Numbers on other pages are out of date',
}

/**
 * Top-of-page verdict on whether the rest of the app can be trusted right now.
 *
 * Deliberately concrete: "Data ends Jul 04, 2026. 22 days unimported." A hedge
 * like "data may be stale" is the same as saying nothing, because the user
 * cannot tell whether it applies to them.
 */
export default function StalenessBanner({ freshness }: StalenessBannerProps) {
  const styles = LEVEL_STYLES[freshness.level]
  const isFresh = freshness.level === 'fresh'
  const Icon = LEVEL_ICON[freshness.level]

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      aria-live="polite"
      className={`flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 ${styles.container}`}
    >
      <Icon className={`size-6 shrink-0 ${styles.icon}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">{LEVEL_TITLE[freshness.level]}</h2>
        <p className="mt-0.5 text-sm text-foreground">{freshness.headline}</p>
        <p className="mt-0.5 text-xs text-text-tertiary">{freshness.detail}</p>
      </div>
      {!isFresh && (
        <Link
          to={ROUTES.UPLOAD}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${styles.cta}`}
        >
          Upload latest file
        </Link>
      )}
    </motion.section>
  )
}
