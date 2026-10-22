import type { HeatmapMode } from '../types'
import { heatmapLegendStops, type HeatmapLegendStop, type HeatmapLevelKey } from './heatmapLevels'

interface Props {
  mode: HeatmapMode
  /** Level the grid is highlighting, if any. */
  highlightKey?: HeatmapLevelKey | null
  /** Makes every swatch a toggle that highlights its level on the grid. */
  onToggle?: (stop: HeatmapLegendStop) => void
}

function Swatch({ color, className = '' }: Readonly<{ color: string; className?: string }>) {
  return (
    <span
      className={`h-3 w-3 rounded-sm ${className}`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  )
}

/**
 * The swatch row. With `onToggle` each stop is a native toggle button: pressing
 * one highlights that level on the grid and dims the rest, pressing it again
 * clears the highlight. Buttons are 44px tall but 24px wide (compact-control),
 * so nine net stops still fit one row on a 375px phone.
 */
function Stops({ mode, highlightKey = null, onToggle }: Readonly<Props>) {
  const stops = heatmapLegendStops(mode)
  if (!onToggle) {
    return stops.map((stop) => <Swatch key={stop.key} color={stop.color} />)
  }

  return (
    <fieldset aria-label="Highlight days by level" className="m-0 flex min-w-0 border-0 p-0">
      {stops.map((stop) => {
        const pressed = stop.key === highlightKey
        const receded = highlightKey !== null && !pressed
        return (
          <button
            key={stop.key}
            type="button"
            data-compact-control="true"
            aria-pressed={pressed}
            aria-label={`Highlight days with ${stop.label}`}
            onClick={() => onToggle(stop)}
            className="group grid h-11 w-6 cursor-pointer place-items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Swatch
              color={stop.color}
              className={`transition-[transform,opacity] duration-150 group-hover:scale-125 group-aria-pressed:scale-125 group-aria-pressed:ring-2 group-aria-pressed:ring-foreground ${receded ? 'opacity-40' : ''}`}
            />
          </button>
        )
      })}
    </fieldset>
  )
}

/**
 * Legend for the calendar heatmap.
 *
 * `expense`/`income` are single-sign, so they keep the plain Less-to-More ramp.
 * `net` is diverging: the deficit ramp runs down to the neutral zero stop and
 * back up the surplus ramp, so the legend has to name both directions -- a
 * bare "Less/More" would leave the darkest red cell looking like top savings.
 */
export default function HeatmapLegend(props: Readonly<Props>) {
  if (props.mode !== 'net') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <span>Less</span>
        <Stops {...props} />
        <span>More</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-tertiary">
      <span className="text-app-red">More deficit</span>
      <Stops {...props} />
      <span className="text-app-green">More surplus</span>
      <span className="w-full sm:ml-1 sm:w-auto">Grey = zero or no activity</span>
    </div>
  )
}
