import { getTodayKey } from '@/lib/dateUtils'

import type { DayCell } from './DayOfWeekChart'
import { getHeatmapSwatch } from '../heatmapUtils'
import { heatmapNeutral, heatmapRamps, type HeatmapMode } from '../types'

type HeatmapSign = ReturnType<typeof getHeatmapSwatch>['sign']
type RampSign = Exclude<HeatmapSign, 'neutral'>

/** One legend stop, as the `sign:level` pair getHeatmapSwatch gives a day. */
export type HeatmapLevelKey = `${HeatmapSign}:${number}`

export interface HeatmapLegendStop {
  key: HeatmapLevelKey
  color: string
  /** Lower-case phrase for button names and announcements, e.g. "high spending". */
  label: string
}

/** How a day relates to the highlighted level; undefined while nothing is highlighted. */
export type HeatmapHighlight = 'match' | 'dim'

const NEUTRAL_KEY: HeatmapLevelKey = 'neutral:0'

/** Words for intensity levels 1-4. */
const LEVEL_WORDS = ['low', 'medium', 'high', 'highest']

const LEVEL_NOUNS: Record<HeatmapMode, Record<RampSign, string>> = {
  expense: { surplus: 'spending', deficit: 'spending' },
  income: { surplus: 'earning', deficit: 'earning' },
  net: { surplus: 'surplus', deficit: 'deficit' },
}

/** A day's signed figure in the active metric; `net` keeps its direction. */
export function heatmapCellValue(cell: DayCell, mode: HeatmapMode): number {
  if (mode === 'expense') return cell.expense
  if (mode === 'income') return cell.income
  return cell.net
}

/** The legend stop a value falls on, from the same scale that paints the cell. */
export function heatmapLevelKey(mode: HeatmapMode, value: number, max: number): HeatmapLevelKey {
  const { sign, level } = getHeatmapSwatch(mode, value, max)
  return `${sign}:${level}`
}

/**
 * Whether a day matches the highlighted level. Future days belong to no
 * level, so they always recede while a highlight is on.
 */
export function heatmapHighlight(
  highlightKey: HeatmapLevelKey | null,
  isFuture: boolean,
  key: HeatmapLevelKey,
): HeatmapHighlight | undefined {
  if (highlightKey === null) return undefined
  return !isFuture && key === highlightKey ? 'match' : 'dim'
}

/** Days that have happened and sit on `key`, for the highlight announcement. */
export function countHeatmapLevel(
  grid: readonly DayCell[],
  mode: HeatmapMode,
  max: number,
  key: HeatmapLevelKey,
): number {
  const today = getTodayKey()
  return grid.filter(
    (cell) => cell.date <= today && heatmapLevelKey(mode, heatmapCellValue(cell, mode), max) === key,
  ).length
}

function rampStops(mode: HeatmapMode, sign: RampSign): HeatmapLegendStop[] {
  // Index 0 of a ramp is the neutral stop, which the legend shows once.
  return heatmapRamps[mode][sign].slice(1).map((color, index): HeatmapLegendStop => ({
    key: `${sign}:${index + 1}`,
    color,
    label: `${LEVEL_WORDS[index]} ${LEVEL_NOUNS[mode][sign]}`,
  }))
}

/**
 * Legend stops in display order. Single-sign modes run from the empty cell up
 * their one ramp; `net` runs down the deficit ramp to the neutral stop and
 * back up the surplus ramp, so the darkest red reads as the worst deficit.
 */
export function heatmapLegendStops(mode: HeatmapMode): HeatmapLegendStop[] {
  const neutral: HeatmapLegendStop = {
    key: NEUTRAL_KEY,
    color: heatmapNeutral,
    label: mode === 'net' ? 'zero or no activity' : 'no activity',
  }
  const surplus = rampStops(mode, 'surplus')
  if (mode !== 'net') return [neutral, ...surplus]
  return [...rampStops(mode, 'deficit').reverse(), neutral, ...surplus]
}
