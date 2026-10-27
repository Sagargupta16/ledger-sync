/**
 * Area marks for the chart kit. A plain area fills from its line down to the
 * zero line (clamped into the value axis); a stacked one (its series spec has a
 * stackId) fills its own layer between the stack's y0 and y1; a band fills
 * between `lowerKey` and `upperKey` with no stroke, like a forecast cone.
 * The gradient fill wipes in left to right while its LineSeries draws, both on
 * the same seriesIndex delay; LineSeries documents the motion rules.
 */

import { useMemo } from 'react'

import { useCartesian } from './chartContext'
import LineSeries, { SeriesPath, type LineSeriesProps } from './LineSeries'

export interface AreaSeriesProps extends LineSeriesProps {
  /** Gradient opacity at the top of the fill (default 0.22), fading to 0 at the bottom. */
  readonly fillOpacity?: number
  /** false draws the line alone (default true). */
  readonly showFill?: boolean
  /** With `upperKey`: fill between two series, no stroke. `dataKey` then only names the band. */
  readonly lowerKey?: string
  /** With `lowerKey`; its series spec picks the band's axis. */
  readonly upperKey?: string
}

/** A filled series under its line: to the baseline, as a stack layer, or as a lower/upper band. */
export default function AreaSeries({ fillOpacity, showFill = true, lowerKey, upperKey, ...line }: AreaSeriesProps) {
  const { rows, numberAt, stacked, scaleFor, category, plot } = useCartesian()
  const { dataKey } = line
  const band = useMemo(
    () => (lowerKey !== undefined && upperKey !== undefined ? { lower: lowerKey, upper: upperKey } : null),
    [lowerKey, upperKey],
  )
  const scale = scaleFor(band ? band.upper : dataKey)
  const stack = band ? undefined : stacked(dataKey)
  // A hover keeps rows, scale and stack, so both edges keep their identity and the fill skips the render.
  const { top, bottom } = useMemo(() => {
    const [min, max] = scale.domain
    // Zero, or the domain edge nearest it when the axis does not reach zero.
    const baseline = scale(Math.min(Math.max(0, min), max))
    const toPixel = (value: number | null) => (value === null ? null : scale(value))
    return {
      top: rows.map((row, index) => {
        if (band) return toPixel(numberAt(row, band.upper))
        return stack ? scale(stack[index].y1) : toPixel(numberAt(row, dataKey))
      }),
      bottom: rows.map((row, index) => {
        if (band) return toPixel(numberAt(row, band.lower))
        return stack ? scale(stack[index].y0) : baseline
      }),
    }
  }, [rows, numberAt, scale, stack, band, dataKey])

  return (
    <g>
      {showFill && (
        <SeriesPath
          dataKey={dataKey}
          color={line.color}
          top={top}
          bottom={bottom}
          category={category}
          plot={plot}
          fillOpacity={fillOpacity}
          curve={line.curve}
          connectNulls={line.connectNulls}
          seriesIndex={line.seriesIndex}
        />
      )}
      {band === null && <LineSeries {...line} />}
    </g>
  )
}
