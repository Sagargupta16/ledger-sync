import { getTodayKey } from '@/lib/dateUtils'

import type { DayCell } from './DayOfWeekChart'
import type { HeatmapMode } from '../types'
import HeatmapCell from './HeatmapCell'

interface Props {
  grid: DayCell[]
  mode: HeatmapMode
  modeMax: number
  keyboardDate?: string | null
}

export default function HeatmapWeeks({
  grid,
  mode,
  modeMax,
  keyboardDate,
}: Readonly<Props>) {
  const totalWeeks = grid.length > 0 ? (grid.at(-1)?.weekIndex ?? 52) + 1 : 53
  const todayKey = getTodayKey()
  const keyboardAnchor =
    grid.find((cell) => cell.date === keyboardDate && cell.date <= todayKey) ??
    grid.find((cell) => cell.isToday && cell.date <= todayKey) ??
    grid.find((cell) => cell.date <= todayKey)
  const weeks: React.ReactNode[] = []

  for (let w = 0; w < totalWeeks; w++) {
    const weekCells = grid.filter((c) => c.weekIndex === w)
    weeks.push(
      <div
        key={w}
        className="heatmap-week-appear flex flex-col gap-0.5"
        style={{ animationDelay: `${w * 12}ms` }}
      >
        {Array.from({ length: 7 }, (_, dow) => {
          const cell = weekCells.find((c) => c.dayOfWeek === dow)
          if (!cell) return <div key={dow} className="w-[13px] h-[13px]" />
          return (
            <HeatmapCell
              key={cell.date}
              cell={cell}
              mode={mode}
              modeMax={modeMax}
              isKeyboardAnchor={cell.date === keyboardAnchor?.date}
            />
          )
        })}
      </div>,
    )
  }

  return <>{weeks}</>
}
