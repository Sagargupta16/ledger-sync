import { motion } from 'framer-motion'

import { rawColors } from '@/constants/colors'

/**
 * Shared progress / bullet bar.
 *
 * Before this, ~10 files hand-rolled `h-2 bg-muted/30 rounded-full` + an inner
 * `width: %` div, each slightly different. This is the one primitive for
 * "actual vs target" metrics:
 *   - `value`/`max`         -> fill width (clamped 0-100%)
 *   - `target`              -> a tick marking the goal/threshold on the track
 *   - `bands`               -> qualitative background zones (bullet-graph style)
 *   - `color`               -> fill color (defaults to app blue)
 *
 * Keep it presentational: callers pass resolved colors (tokens), never hex.
 */
interface Band {
  /** Upper bound of this band as a percent of `max` (0-100). */
  readonly upTo: number
  /** Background color for the zone (token, low alpha recommended). */
  readonly color: string
}

interface ProgressBarProps {
  readonly value: number
  /** Denominator; the fill is `value/max`. Default 100 (value is already a %). */
  readonly max?: number
  /** Fill color. Default app blue. */
  readonly color?: string
  /** Track height in px. Default 8. */
  readonly height?: number
  /** Draw a target tick at this value (same scale as `value`). */
  readonly target?: number
  /** Qualitative background zones, ascending by `upTo`. Renders a bullet graph. */
  readonly bands?: readonly Band[]
  /** Accessible label; renders a native progress element for assistive technology. */
  readonly ariaLabel?: string
  readonly className?: string
}

export default function ProgressBar({
  value,
  max = 100,
  color = rawColors.app.blue,
  height = 8,
  target,
  bands,
  ariaLabel,
  className = '',
}: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const targetPct =
    target !== undefined && max > 0 ? Math.max(0, Math.min(100, (target / max) * 100)) : null
  const semanticMax = max > 0 ? max : 100
  const semanticValue = Math.max(0, Math.min(semanticMax, value))

  return (
    <>
      {ariaLabel && (
        <progress
          className="sr-only"
          value={semanticValue}
          max={semanticMax}
          aria-label={ariaLabel}
        />
      )}
      <div
        aria-hidden
        className={`relative w-full rounded-full overflow-hidden bg-[var(--overlay-3)] ${className}`}
        style={{ height }}
      >
        {/* Qualitative bands (bullet graph background) */}
        {bands?.map((band, i) => {
          const start = i === 0 ? 0 : bands[i - 1].upTo
          return (
            <div
              key={`band-${band.upTo}`}
              className="absolute inset-y-0"
              style={{
                left: `${start}%`,
                width: `${Math.max(0, band.upTo - start)}%`,
                backgroundColor: band.color,
              }}
            />
          )
        })}

        {/* Fill: draws from 0 on mount, springs between values on change. */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        />

        {/* Target tick */}
        {targetPct !== null && (
          <div
            className="absolute inset-y-0 w-0.5 bg-[var(--overlay-8)]"
            style={{ left: `${targetPct}%` }}
          />
        )}
      </div>
    </>
  )
}
