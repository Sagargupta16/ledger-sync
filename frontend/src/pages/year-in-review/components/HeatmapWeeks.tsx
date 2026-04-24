import type { DayCell } from './DayOfWeekChart'
import type { HeatmapMode } from '../types'
import HeatmapCell from './HeatmapCell'

interface Props {
  grid: DayCell[]
  mode: HeatmapMode
  modeMax: number
}

export default function HeatmapWeeks({ grid, mode, modeMax }: Readonly<Props>) {
  const totalWeeks = grid.length > 0 ? (grid.at(-1)?.weekIndex ?? 52) + 1 : 53
  const weeks: React.ReactNode[] = []

  for (let w = 0; w < totalWeeks; w++) {
    const weekCells = grid.filter((c) => c.weekIndex === w)
    weeks.push(
      <div key={w} className="flex flex-col gap-0.5">
        {Array.from({ length: 7 }, (_, dow) => {
          const cell = weekCells.find((c) => c.dayOfWeek === dow)
          if (!cell) return <div key={dow} className="w-[13px] h-[13px]" />
          return <HeatmapCell key={dow} cell={cell} mode={mode} modeMax={modeMax} />
        })}
      </div>,
    )
  }

  return <>{weeks}</>
}
