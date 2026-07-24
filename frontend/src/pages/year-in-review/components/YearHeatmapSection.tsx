import { useState } from 'react'

import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'

import { DAYS, MONTHS_SHORT, heatmapColors, modeAccent } from '../types'
import type { useYearInReview } from '../useYearInReview'

import type { DayCell } from './DayOfWeekChart'
import HeatmapDayDetail from './HeatmapDayDetail'
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

export default function YearHeatmapSection({
  review,
}: YearHeatmapSectionProps) {
  const modeLabel = MODE_LABELS[review.mode]
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
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
      className="glass rounded-2xl border border-border p-4 sm:p-6"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Flame className="h-5 w-5 shrink-0" style={{ color: modeAccent[review.mode] }} />
          <span>
            {modeLabel} Heatmap -- {review.isFYMode ? review.currentFY : review.selectedYear}
          </span>
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <span>Less</span>
          {heatmapColors[review.mode].map((color) => (
            <span
              key={color}
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          ))}
          <span>More</span>
        </div>
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
                aria-label={`${modeLabel} heatmap grid`}
                onMouseOver={(event) => {
                  const target = (event.target as HTMLElement).closest<HTMLElement>(
                    '[data-cell-date]',
                  )
                  if (target) {
                    setSelectedMonth(null)
                    const found: DayCell | undefined = review.grid.find(
                      (cell) => cell.date === target.dataset.cellDate,
                    )
                    review.setHoveredDay(found ?? null)
                  }
                }}
                onFocus={(event) => {
                  const target = (event.target as HTMLElement).closest<HTMLElement>(
                    '[data-cell-date]',
                  )
                  if (target) {
                    setSelectedMonth(null)
                    const found: DayCell | undefined = review.grid.find(
                      (cell) => cell.date === target.dataset.cellDate,
                    )
                    review.setHoveredDay(found ?? null)
                  }
                }}
                onMouseLeave={() => review.setHoveredDay(null)}
                onBlur={() => review.setHoveredDay(null)}
              >
                <HeatmapWeeks
                  grid={review.grid}
                  mode={review.mode}
                  modeMax={review.modeMax}
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
