import type {
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
} from 'react'

import { getTodayKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'
import type { DayCell } from './DayOfWeekChart'
import { getHeatmapSwatch, heatmapValueNoun } from '../heatmapUtils'
import { modeAccent, type HeatmapMode } from '../types'

interface Props {
  cell: DayCell
  mode: HeatmapMode
  modeMax: number
  isKeyboardAnchor?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>
  onFocus?: FocusEventHandler<HTMLButtonElement>
  onBlur?: FocusEventHandler<HTMLButtonElement>
}

export default function HeatmapCell({
  cell,
  mode,
  modeMax,
  isKeyboardAnchor = false,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: Readonly<Props>) {
  // Signed, so `net` keeps its direction: the swatch takes its hue from the
  // sign and the label says which way the day went.
  const valMap = { expense: cell.expense, income: cell.income, net: cell.net }
  const val = valMap[mode]
  const isFuture = cell.date > getTodayKey()
  const { color: bgColor } = getHeatmapSwatch(mode, val, modeMax)

  // Focusable + labelled so keyboard/SR users get the per-day figure.
  // Empty days read as "no activity".
  let label = `${cell.date}: no activity`
  if (isFuture) {
    label = `${cell.date}: future date`
  } else if (val !== 0) {
    label = `${cell.date}: ${formatCurrency(Math.abs(val))} ${heatmapValueNoun(mode, val)}`
  }

  // A real <button> (not a div with role/tabIndex) is natively interactive.
  // type=button avoids implicit form submission.
  return (
    <button
      type="button"
      data-cell-date={cell.date}
      data-compact-control="true"
      disabled={isFuture}
      tabIndex={isKeyboardAnchor ? 0 : -1}
      aria-label={label}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className="w-[13px] h-[13px] rounded-sm p-0 border-0 cursor-default transition-[outline-color] duration-150 hover:ring-1 hover:ring-[var(--hairline-5)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--hairline-5)]"
      style={{
        backgroundColor: isFuture ? 'var(--overlay-2)' : bgColor,
        outline: cell.isToday ? `2px solid ${modeAccent[mode]}` : undefined,
        outlineOffset: cell.isToday ? '-1px' : undefined,
      }}
    />
  )
}
