import { useLayoutEffect, useRef } from 'react'

import { motion } from 'motion/react'
import { Flame } from 'lucide-react'

import { DAYS, MONTHS_SHORT, modeAccent } from '../types'
import type { useYearInReview } from '../useYearInReview'

import HeatmapDayDetail from './HeatmapDayDetail'
import HeatmapLegend from './HeatmapLegend'
import HeatmapWeeks from './HeatmapWeeks'
import MobileMonthlySummary from './MobileMonthlySummary'
import { useHeatmapControls } from './useHeatmapControls'
import { useHeatmapMotion } from './useHeatmapMotion'

type YearReviewState = ReturnType<typeof useYearInReview>

interface YearHeatmapSectionProps {
  readonly review: YearReviewState
}

const MODE_LABELS = {
  expense: 'Spending',
  income: 'Earning',
  net: 'Savings',
} as const

/**
 * Scrolls a grid wider than its box so the newest day that has happened sits
 * at the right edge: this week in the current year, December in a past one.
 */
function scrollToNewestWeek(scroller: HTMLElement | null) {
  if (!scroller) return
  const days = scroller.querySelectorAll('button[data-cell-date]:not(:disabled)')
  // The week column, not the cell: a cell waiting to wave in is scaled down.
  const column = days[days.length - 1]?.parentElement
  if (!column) return
  scroller.scrollLeft += column.getBoundingClientRect().right - scroller.getBoundingClientRect().right
}

export default function YearHeatmapSection({
  review,
}: YearHeatmapSectionProps) {
  const modeLabel = MODE_LABELS[review.mode]
  const scrollerRef = useRef<HTMLDivElement>(null)
  const timing = useHeatmapMotion(scrollerRef)
  const controls = useHeatmapControls(review)
  const { selectedMonth } = controls
  // Every period opens on its newest week, the way a phone shows the grid.
  const periodStart = review.grid[0]?.date
  useLayoutEffect(() => scrollToNewestWeek(scrollerRef.current), [periodStart])
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
      className="ledger-panel min-w-0 p-4 sm:p-6"
    >
      <p className="ledger-meta mb-2 text-app-blue">Activity across the year</p>
      <div className="mb-3 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Flame className="h-5 w-5 shrink-0" style={{ color: modeAccent[review.mode] }} />
          <span>
            {modeLabel} Heatmap -- {review.periodLabel}
          </span>
        </h2>
        {/* Phones get month tiles, not the grid (its cells are far below a 44px target), so the legend stays a key there. */}
        <div className="lg:hidden">
          <HeatmapLegend mode={review.mode} />
        </div>
        <div className="hidden lg:block">
          <HeatmapLegend
            mode={review.mode}
            highlightKey={controls.highlightKey}
            onToggle={controls.toggleHighlight}
          />
        </div>
      </div>
      <p className="mb-6 hidden text-sm text-muted-foreground lg:block">
        Each square is one day. Focus a day and use the arrow keys to explore its figures, or press
        a legend swatch to highlight one level.
      </p>
      <p className="mb-5 text-sm text-muted-foreground lg:hidden">
        Select a month to see its spending, income, and net cash flow.
      </p>

      <div className="hidden lg:block">
        <div ref={scrollerRef} className="overflow-x-auto pr-1 pb-1">
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
                aria-label={`${modeLabel} heatmap grid. Use arrow keys to move between days, Enter to select one and Escape to clear.`}
              >
                <HeatmapWeeks
                  grid={review.grid}
                  mode={review.mode}
                  modeMax={review.modeMax}
                  keyboardDate={controls.keyboardDate}
                  selectedDate={controls.selectedDay?.date}
                  highlightKey={controls.highlightKey}
                  timing={timing}
                  handlers={controls.handlers}
                />
              </section>
            </div>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {controls.announcement}
      </p>

      <MobileMonthlySummary
        mode={review.mode}
        monthlyExpense={review.stats.monthlyExpense}
        monthlyIncome={review.stats.monthlyIncome}
        selectedMonth={selectedMonth}
        onSelectMonth={controls.selectMonth}
      />

      <div className="mt-5 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-sm tabular-nums sm:gap-x-6">
        <HeatmapDayDetail
          hoveredDay={review.hoveredDay}
          selectedDay={controls.selectedDay}
          monthlyDetail={monthlyDetail}
        />
      </div>
    </motion.section>
  )
}
