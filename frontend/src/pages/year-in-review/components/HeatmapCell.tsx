import { memo } from 'react'

import { motion } from 'motion/react'

import { getTodayKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'
import type { DayCell } from './DayOfWeekChart'
import { getHeatmapSwatch, heatmapValueNoun } from '../heatmapUtils'
import { modeAccent, type HeatmapMode } from '../types'
import { heatmapCellValue, heatmapHighlight, type HeatmapLevelKey } from './heatmapLevels'
import type { HeatmapCellHandlers } from './useHeatmapControls'
import {
  HEATMAP_DIMMED,
  HEATMAP_HIDDEN,
  HEATMAP_STILL,
  heatmapCellTransition,
  heatmapSweepStyle,
  type HeatmapMotion,
} from './useHeatmapMotion'

interface Props extends Partial<HeatmapCellHandlers> {
  cell: DayCell
  mode: HeatmapMode
  modeMax: number
  isKeyboardAnchor?: boolean
  isSelected?: boolean
  /** Legend level on show: matching days get a ring, the rest dim. */
  highlightKey?: HeatmapLevelKey | null
  /** Wave-in and sweep timing from the section; without it the final state paints at once. */
  timing?: HeatmapMotion
  /** Week columns in the grid, which spread the left-to-right stagger. */
  totalWeeks?: number
}

function HeatmapCell({
  cell,
  mode,
  modeMax,
  isKeyboardAnchor = false,
  isSelected = false,
  highlightKey = null,
  timing = HEATMAP_STILL,
  totalWeeks = 1,
  onKeyDown,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: Readonly<Props>) {
  // Signed, so `net` keeps its direction: the swatch takes its hue from the
  // sign and the label says which way the day went.
  const val = heatmapCellValue(cell, mode)
  const isFuture = cell.date > getTodayKey()
  const swatch = getHeatmapSwatch(mode, val, modeMax)
  const highlight = heatmapHighlight(highlightKey, isFuture, `${swatch.sign}:${swatch.level}`)

  // Focusable + labelled so keyboard/SR users get the per-day figure.
  // Empty days read as "no activity".
  let label = `${cell.date}: no activity`
  if (isFuture) {
    label = `${cell.date}: future date`
  } else if (val !== 0) {
    label = `${cell.date}: ${formatCurrency(Math.abs(val))} ${heatmapValueNoun(mode, val)}`
  }
  if (isSelected) label += ', selected'

  // Until the grid scrolls into view every cell waits hidden; then each week
  // fades and scales in a step after the one to its left.
  const waiting = timing.animate && (timing.intro || !timing.entered)
  const shown = { opacity: highlight === 'dim' ? HEATMAP_DIMMED : 1, scale: 1 }
  const ring = isSelected ? 'ring-2 ring-foreground' : 'hover:ring-1 hover:ring-[var(--hairline-5)]'

  // A real <button> (not a div with role/tabIndex) is natively interactive.
  // type=button avoids implicit form submission.
  return (
    <motion.button
      type="button"
      data-cell-date={cell.date}
      data-compact-control="true"
      data-highlight={highlight}
      disabled={isFuture}
      tabIndex={isKeyboardAnchor ? 0 : -1}
      aria-label={label}
      onKeyDown={(event) => onKeyDown?.(event, cell)}
      onClick={() => onSelect?.(cell)}
      onMouseEnter={() => onMouseEnter?.(cell)}
      onMouseLeave={onMouseLeave}
      onFocus={() => onFocus?.(cell)}
      onBlur={onBlur}
      initial={waiting ? HEATMAP_HIDDEN : false}
      animate={timing.entered ? shown : HEATMAP_HIDDEN}
      transition={heatmapCellTransition(timing, cell.weekIndex, totalWeeks)}
      onAnimationStart={timing.intro ? timing.onIntroStart : undefined}
      className={`w-[13px] h-[13px] rounded-sm p-0 border-0 cursor-default enabled:cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[highlight=match]:inset-ring-1 data-[highlight=match]:inset-ring-foreground/70 ${ring}`}
      style={{
        backgroundColor: isFuture ? 'var(--overlay-2)' : swatch.color,
        outline: cell.isToday ? `2px solid ${modeAccent[mode]}` : undefined,
        outlineOffset: cell.isToday ? '-1px' : undefined,
        ...heatmapSweepStyle(timing.animate, cell.weekIndex, totalWeeks),
      }}
    />
  )
}

// Hover and focus re-render the section; memo keeps that to the cells whose props changed.
export default memo(HeatmapCell)
