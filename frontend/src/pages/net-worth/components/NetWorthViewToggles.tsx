import { BarChart3, Sparkles, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'

import { PROJECTION_HORIZON_MONTHS } from '../netWorthCompound'

interface NetWorthViewTogglesProps {
  motionEnabled: boolean
  showProjection: boolean
  setShowProjection: (v: boolean) => void
  setShowStacked: (v: boolean) => void
  effectiveStacked: boolean
  stackedAllowed: boolean
  monthlyGrowth: number
  /** The projection compounds the saving; false when it is the straight line. */
  compounding: boolean
}

function projectTitle(monthlyGrowth: number, compounding: boolean): string {
  if (monthlyGrowth <= 0) return 'Need positive monthly growth to project'
  return compounding
    ? `Project forward: your average monthly saving, compounding for ${PROJECTION_HORIZON_MONTHS / 12} years at the measured growth of your yearly savings (cash-flow trend; market gains not tracked)`
    : 'Project forward at your average monthly saving (cash-flow trend; market gains not tracked)'
}

/** Project / stacked-view toggles; each turns the other off when enabled. */
export function NetWorthViewToggles({
  motionEnabled,
  showProjection,
  setShowProjection,
  setShowStacked,
  effectiveStacked,
  stackedAllowed,
  monthlyGrowth,
  compounding,
}: Readonly<NetWorthViewTogglesProps>) {
  return (
    <fieldset className="m-0 grid w-full grid-cols-2 gap-2 border-0 p-0 sm:flex sm:w-auto">
      <legend className="sr-only">Net worth chart view options</legend>
      <motion.button
        type="button"
        whileTap={motionEnabled ? { scale: 0.97 } : undefined}
        onClick={() => {
          setShowProjection(!showProjection)
          if (!showProjection) setShowStacked(false)
        }}
        disabled={monthlyGrowth <= 0}
        aria-pressed={showProjection}
        title={projectTitle(monthlyGrowth, compounding)}
        className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/50 ${showProjection
            ? 'border-app-blue/40 bg-app-blue/15 text-foreground'
            : 'border-border bg-[var(--overlay-2)] text-muted-foreground hover:bg-[var(--overlay-5)]'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <Sparkles className="w-4 h-4" aria-hidden />
        {showProjection ? 'Projecting' : 'Project'}
      </motion.button>
      <motion.button
        type="button"
        whileTap={motionEnabled ? { scale: 0.97 } : undefined}
        onClick={() => {
          setShowStacked(!effectiveStacked)
          if (!effectiveStacked) setShowProjection(false)
        }}
        disabled={!stackedAllowed}
        aria-pressed={effectiveStacked}
        title={stackedAllowed ? undefined : 'Stacked view is unavailable while net worth is negative in this range'}
        className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/50 disabled:cursor-not-allowed disabled:opacity-40 ${effectiveStacked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-[var(--overlay-2)] text-muted-foreground hover:bg-[var(--overlay-5)]'
          }`}
      >
        {effectiveStacked ? (
          <BarChart3 className="w-4 h-4" aria-hidden />
        ) : (
          <TrendingUp className="w-4 h-4" aria-hidden />
        )}
        {effectiveStacked ? 'Stacked View' : 'Total View'}
      </motion.button>
    </fieldset>
  )
}
