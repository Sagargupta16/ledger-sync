import { getTodayKey } from '@/lib/dateUtils'

import type { DayCell } from './DayOfWeekChart'
import type { HeatmapMode } from '../types'
import HeatmapCell from './HeatmapCell'
import type { HeatmapLevelKey } from './heatmapLevels'
import type { HeatmapCellHandlers } from './useHeatmapControls'
import type { HeatmapMotion } from './useHeatmapMotion'

interface Props {
  grid: DayCell[]
  mode: HeatmapMode
  modeMax: number
  keyboardDate?: string | null
  selectedDate?: string | null
  highlightKey?: HeatmapLevelKey | null
  timing?: HeatmapMotion
  handlers?: HeatmapCellHandlers
}

export default function HeatmapWeeks({
  grid,
  mode,
  modeMax,
  keyboardDate,
  selectedDate,
  highlightKey,
  timing,
  handlers,
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
      <div key={w} className="flex flex-col gap-0.5">
        {Array.from({ length: 7 }, (_, dow) => {
          const cell = weekCells.find((c) => c.dayOfWeek === dow)
          if (!cell) return <div key={dow} className="w-[13px] h-[13px]" />
          // Keyed by grid position, not date: a new period reuses the element,
          // so its colour sweeps to the new value instead of remounting.
          return (
            <HeatmapCell
              key={dow}
              cell={cell}
              mode={mode}
              modeMax={modeMax}
              isKeyboardAnchor={cell.date === keyboardAnchor?.date}
              isSelected={cell.date === selectedDate}
              highlightKey={highlightKey}
              timing={timing}
              totalWeeks={totalWeeks}
              {...handlers}
            />
          )
        })}
      </div>,
    )
  }

  return <>{weeks}</>
}
