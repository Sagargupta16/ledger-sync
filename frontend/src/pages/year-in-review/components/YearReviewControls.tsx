import { motion } from 'framer-motion'
import { DollarSign, TrendingDown, TrendingUp } from 'lucide-react'

import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { Button } from '@/components/ui'

import { modeAccent, type HeatmapMode } from '../types'
import type { useYearInReview } from '../useYearInReview'

type YearReviewState = ReturnType<typeof useYearInReview>

interface YearReviewControlsProps {
  readonly review: YearReviewState
}

const MODE_OPTIONS = [
  ['expense', 'Spending', TrendingDown],
  ['income', 'Earning', TrendingUp],
  ['net', 'Savings', DollarSign],
] as const

export default function YearReviewControls({
  review,
}: YearReviewControlsProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
      <AnalyticsTimeFilter
        viewMode={review.viewMode}
        onViewModeChange={review.setViewMode}
        currentYear={review.currentYear}
        currentMonth={review.currentMonth}
        currentFY={review.currentFY}
        onYearChange={review.setCurrentYear}
        onMonthChange={review.setCurrentMonth}
        onFYChange={review.setCurrentFY}
        minDate={review.dataDateRange.minDate}
        maxDate={review.dataDateRange.maxDate}
        fiscalYearStartMonth={review.fiscalYearStartMonth}
        availableModes={['yearly', 'fy']}
      />

      <div
        className="flex w-full items-center gap-1 rounded-lg border border-[var(--hairline-1)] bg-[var(--overlay-2)] p-1 sm:w-auto"
        role="tablist"
        aria-label="Heatmap metric"
      >
        {MODE_OPTIONS.map(([value, label, Icon]) => (
          <Button
            key={value}
            type="button"
            role="tab"
            aria-selected={review.mode === value}
            variant="ghost"
            size="sm"
            onClick={() => review.setMode(value as HeatmapMode)}
            className={`relative flex-1 overflow-hidden px-2.5 sm:flex-none sm:px-3 ${
              review.mode === value
                ? 'text-foreground hover:text-foreground'
                : 'text-muted-foreground'
            }`}
          >
            {review.mode === value && (
              <motion.span
                layoutId="heatmapModeTab"
                className="absolute inset-0 rounded-md"
                style={{ backgroundColor: modeAccent[value] }}
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <Icon className="relative z-10 h-3.5 w-3.5" />
            <span className="relative z-10">{label}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
