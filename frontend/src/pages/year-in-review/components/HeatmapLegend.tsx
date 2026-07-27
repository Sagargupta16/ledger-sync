import { heatmapNeutral, heatmapRamps, type HeatmapMode } from '../types'

interface Props {
  mode: HeatmapMode
}

function Swatch({ color }: Readonly<{ color: string }>) {
  return (
    <span
      className="h-3 w-3 rounded-sm"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
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
export default function HeatmapLegend({ mode }: Readonly<Props>) {
  const { surplus, deficit } = heatmapRamps[mode]
  // Intensity stops only (level 0 is the neutral zero cell, shown once).
  const surplusStops = surplus.slice(1)
  const deficitStops = deficit.slice(1)

  if (mode !== 'net') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <span>Less</span>
        <Swatch color={heatmapNeutral} />
        {surplusStops.map((color) => (
          <Swatch key={color} color={color} />
        ))}
        <span>More</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-tertiary">
      <span className="text-app-red">More deficit</span>
      {[...deficitStops].reverse().map((color) => (
        <Swatch key={color} color={color} />
      ))}
      <Swatch color={heatmapNeutral} />
      {surplusStops.map((color) => (
        <Swatch key={color} color={color} />
      ))}
      <span className="text-app-green">More surplus</span>
      <span className="w-full sm:ml-1 sm:w-auto">Grey = zero or no activity</span>
    </div>
  )
}
