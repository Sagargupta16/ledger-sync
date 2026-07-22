import { formatCurrency } from '@/lib/formatters'
import type { DayCell } from './DayOfWeekChart'
import { getIntensityLevel } from '../heatmapUtils'
import { heatmapColors, modeAccent, type HeatmapMode } from '../types'

interface Props {
  cell: DayCell
  mode: HeatmapMode
  modeMax: number
  /** Stagger delay (ms) for the pop-in wave. */
  appearDelay?: number
}

const MODE_NOUN: Record<HeatmapMode, string> = {
  expense: 'spent',
  income: 'earned',
  net: 'net',
}

export default function HeatmapCell({ cell, mode, modeMax, appearDelay = 0 }: Readonly<Props>) {
  const valMap = { expense: cell.expense, income: cell.income, net: Math.abs(cell.net) }
  const val = valMap[mode]
  const level = getIntensityLevel(val, modeMax)
  const bgColor = heatmapColors[mode][level]

  // Focusable + labelled so keyboard/SR users get the per-day figure (and the
  // parent's onFocus delegation fires at all). Empty days read as "no activity".
  const label = val > 0 ? `${cell.date}: ${formatCurrency(val)} ${MODE_NOUN[mode]}` : `${cell.date}: no activity`

  // A real <button> (not a div with role/tabIndex): natively focusable +
  // interactive, so keyboard/SR users get the per-day figure and the parent's
  // onFocus delegation fires. type=button avoids implicit form submission.
  // The pop-in wave is a per-cell CSS animation (~370 cells) -- framer-motion
  // components at that count would add measurable mount cost for no benefit.
  return (
    <button
      type="button"
      data-cell-date={cell.date}
      aria-label={label}
      className="heatmap-cell-appear w-[13px] h-[13px] rounded-sm p-0 border-0 cursor-default transition-[outline-color] duration-150 hover:ring-1 hover:ring-[var(--hairline-5)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--hairline-5)]"
      style={{
        backgroundColor: bgColor,
        outline: cell.isToday ? `2px solid ${modeAccent[mode]}` : undefined,
        outlineOffset: cell.isToday ? '-1px' : undefined,
        animationDelay: `${appearDelay}ms`,
      }}
    />
  )
}
