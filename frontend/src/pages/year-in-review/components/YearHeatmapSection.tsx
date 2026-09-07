import { useState, type KeyboardEvent } from 'react'

import { motion } from 'motion/react'
import { Flame } from 'lucide-react'

import { addDaysToKey } from '@/lib/dateUtils'

import { DAYS, MONTHS_SHORT, modeAccent } from '../types'
import type { useYearInReview } from '../useYearInReview'

import HeatmapDayDetail from './HeatmapDayDetail'
import HeatmapLegend from './HeatmapLegend'
import HeatmapWeeks from './HeatmapWeeks'
import MobileMonthlySummary from './MobileMonthlySummary'

type YearReviewState = ReturnType<typeof useYearInReview>

interface YearHeatmapSectionProps {
  readonly review: YearReviewState
}

const MODE_LABELS = {
  expense: 'Spending',
  income: 'Earning',
  net: 'Savings',
} as const

function moveHeatmapFocus(
  event: KeyboardEvent<HTMLButtonElement>,
  onMove: (date: string) => void,
) {
  const currentCell = event.currentTarget
  const heatmap = currentCell.closest<HTMLElement>('[data-heatmap-grid]')
  if (!heatmap) return

  const enabledCells = Array.from(
    heatmap.querySelectorAll<HTMLButtonElement>(
      'button[data-cell-date]:not(:disabled)',
    ),
  )
  let nextCell: HTMLButtonElement | undefined
  let dayDelta = 0

  if (event.key === 'ArrowRight') dayDelta = 7
  else if (event.key === 'ArrowLeft') dayDelta = -7
  else if (event.key === 'ArrowDown') dayDelta = 1
  else if (event.key === 'ArrowUp') dayDelta = -1
  else if (event.key === 'Home') nextCell = enabledCells[0]
  else if (event.key === 'End') nextCell = enabledCells.at(-1)
  else return

  if (dayDelta !== 0 && currentCell.dataset.cellDate) {
    const targetDate = addDaysToKey(currentCell.dataset.cellDate, dayDelta)
    nextCell = enabledCells.find((cell) => cell.dataset.cellDate === targetDate)
  }
  if (!nextCell) return

  event.preventDefault()
  const nextDate = nextCell.dataset.cellDate
  if (!nextDate) return

  onMove(nextDate)
  nextCell.focus()
}

export default function YearHeatmapSection({
  review,
}: YearHeatmapSectionProps) {
  const modeLabel = MODE_LABELS[review.mode]
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [keyboardDate, setKeyboardDate] = useState<string | null>(null)
  const monthlyDetail =
    selectedMonth == null
      ? null
      : {
          label: MONTHS_SHORT[selectedMonth],
          expense: review.stats.monthlyExpense[selectedMonth] ?? 0,
          income: review.stats.monthlyIncome[selectedMonth] ?? 0,
          net:
            (review.stats.monthlyIncome[selectedMonth] ?? 0) -
            (review.stats.monthlyExpense[selectedMonth] ?? 0),
        }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ledger-panel p-4 sm:p-6"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Flame className="h-5 w-5 shrink-0" style={{ color: modeAccent[review.mode] }} />
          <span>
            {modeLabel} Heatmap -- {review.isFYMode ? review.currentFY : review.selectedYear}
          </span>
        </h2>
        <HeatmapLegend mode={review.mode} />
      </div>

      <div className="hidden lg:block">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="mb-1 ml-10 flex">
              {review.monthLabels.map((label) => (
                <div
                  key={`${label.month}-${label.weekIndex}`}
                  className="text-xs text-text-tertiary"
                  style={{
                    position: 'relative',
                    left: `${label.weekIndex * 15}px`,
                    width: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label.month}
                </div>
              ))}
            </div>

            <div className="flex gap-0.5">
              <div className="mr-1.5 flex flex-col gap-0.5">
                {DAYS.map((day, index) => (
                  <div
                    key={day}
                    className="flex h-[13px] items-center text-caption leading-none text-text-tertiary"
                  >
                    {index % 2 === 1 ? day : ''}
                  </div>
                ))}
              </div>

              <section
                className="flex gap-0.5"
                data-heatmap-grid
                aria-label={`${modeLabel} heatmap grid. Use arrow keys to move between days.`}
              >
                <HeatmapWeeks
                  grid={review.grid}
                  mode={review.mode}
                  modeMax={review.modeMax}
                  keyboardDate={keyboardDate}
                  onCellKeyDown={(event) => moveHeatmapFocus(event, setKeyboardDate)}
                  onCellMouseEnter={(cell) => {
                    setSelectedMonth(null)
                    setKeyboardDate(cell.date)
                    review.setHoveredDay(cell)
                  }}
                  onCellMouseLeave={() => review.setHoveredDay(null)}
                  onCellFocus={(cell) => {
                    setSelectedMonth(null)
                    review.setHoveredDay(cell)
                  }}
                  onCellBlur={() => review.setHoveredDay(null)}
                />
              </section>
            </div>
          </div>
        </div>
      </div>

      <MobileMonthlySummary
        mode={review.mode}
        monthlyExpense={review.stats.monthlyExpense}
        monthlyIncome={review.stats.monthlyIncome}
        selectedMonth={selectedMonth}
        onSelectMonth={(monthIndex) =>
          setSelectedMonth(selectedMonth === monthIndex ? null : monthIndex)
        }
      />

      <div className="mt-4 flex min-h-[28px] flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs sm:gap-x-6">
        <HeatmapDayDetail hoveredDay={review.hoveredDay} monthlyDetail={monthlyDetail} />
      </div>
    </motion.section>
  )
}
