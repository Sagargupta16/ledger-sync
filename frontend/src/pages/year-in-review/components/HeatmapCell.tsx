import { formatCurrency } from '@/lib/formatters'
import type { DayCell } from './DayOfWeekChart'
import { getIntensityLevel } from '../heatmapUtils'
import { heatmapColors, modeAccent, type HeatmapMode } from '../types'

interface Props {
  cell: DayCell
  mode: HeatmapMode
  modeMax: number
}

const MODE_NOUN: Record<HeatmapMode, string> = {
  expense: 'spent',
  income: 'earned',
  net: 'net',
}

export default function HeatmapCell({ cell, mode, modeMax }: Readonly<Props>) {
  const valMap = { expense: cell.expense, income: cell.income, net: Math.abs(cell.net) }
  const val = valMap[mode]
  const level = getIntensityLevel(val, modeMax)
  const bgColor = heatmapColors[mode][level]

  // Focusable + labelled so keyboard/SR users get the per-day figure (and the
  // parent's onFocus delegation fires at all). Empty days read as "no activity".
  const label = val > 0 ? `${cell.date}: ${formatCurrency(val)} ${MODE_NOUN[mode]}` : `${cell.date}: no activity`

  return (
    <div
      data-cell-date={cell.date}
      role="img"
      tabIndex={0}
      aria-label={label}
      className="w-[13px] h-[13px] rounded-sm transition-[outline-color] duration-150 hover:ring-1 hover:ring-white/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/70"
      style={{
        backgroundColor: bgColor,
        outline: cell.isToday ? `2px solid ${modeAccent[mode]}` : undefined,
        outlineOffset: cell.isToday ? '-1px' : undefined,
      }}
    />
  )
}
