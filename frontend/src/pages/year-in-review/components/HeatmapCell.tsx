import type { DayCell } from './DayOfWeekChart'
import { getIntensityLevel } from '../heatmapUtils'
import { heatmapColors, modeAccent, type HeatmapMode } from '../types'

interface Props {
  cell: DayCell
  mode: HeatmapMode
  modeMax: number
}

export default function HeatmapCell({ cell, mode, modeMax }: Readonly<Props>) {
  const valMap = { expense: cell.expense, income: cell.income, net: Math.abs(cell.net) }
  const val = valMap[mode]
  const level = getIntensityLevel(val, modeMax)
  const bgColor = heatmapColors[mode][level]

  return (
    <div
      data-cell-date={cell.date}
      className="w-[13px] h-[13px] rounded-sm transition-[outline-color] duration-150 hover:ring-1 hover:ring-white/50"
      style={{
        backgroundColor: bgColor,
        outline: cell.isToday ? `2px solid ${modeAccent[mode]}` : undefined,
        outlineOffset: cell.isToday ? '-1px' : undefined,
      }}
    />
  )
}
