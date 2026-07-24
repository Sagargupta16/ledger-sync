import { Flame } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageContainer, PageHeader } from '@/components/ui'
import { useChartDimensions } from '@/hooks/useChartDimensions'

import DayOfWeekSection from './components/DayOfWeekSection'
import MonthlyBreakdownChart from './components/MonthlyBreakdownChart'
import YearHeatmapSection from './components/YearHeatmapSection'
import YearInsightsPanel from './components/YearInsightsPanel'
import YearReviewControls from './components/YearReviewControls'
import YearStatsGrid from './components/YearStatsGrid'
import { useYearInReview } from './useYearInReview'

const PAGE_TITLE = 'Year in Review'
const PAGE_SUBTITLE = 'Your annual financial highlights and insights'

export default function YearInReviewPage() {
  const dims = useChartDimensions()
  const review = useYearInReview()

  if (review.isError) {
    return (
      <PageErrorState
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        message="We could not load your transactions, daily summaries, and preferences. Check your connection and try again."
        onRetry={review.retry}
      />
    )
  }

  if (review.isLoading) return <PageSkeleton />

  if (review.transactions.length === 0) {
    return (
      <PageContainer>
        <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />
        <EmptyState
          icon={Flame}
          title="No transaction data yet"
          description="Upload your bank statements to see your annual financial review -- spending heatmaps, streaks, and year-over-year highlights."
          actionLabel="Upload Data"
          actionHref="/upload"
          variant="card"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        action={<YearReviewControls review={review} />}
      />
      <YearStatsGrid stats={review.stats} />
      <YearHeatmapSection review={review} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <MonthlyBreakdownChart monthlyBarData={review.monthlyBarData} dims={dims} />
        <YearInsightsPanel stats={review.stats} />
      </div>
      <DayOfWeekSection grid={review.grid} />
    </PageContainer>
  )
}
