import { AlertTriangle, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader } from '@/components/ui'
import { ROUTES } from '@/constants'

import AnomalyDetectionPanel from './anomaly-review/components/AnomalyDetectionPanel'
import AnomalyFilters from './anomaly-review/components/AnomalyFilters'
import AnomalyList from './anomaly-review/components/AnomalyList'
import AnomalySummary from './anomaly-review/components/AnomalySummary'
import { useAnomalyReview } from './anomaly-review/useAnomalyReview'

export default function AnomalyReviewPage() {
  const review = useAnomalyReview()

  return (
    <PageContainer>
      <PageHeader
        title="Anomaly Review"
        subtitle="Review and manage detected financial anomalies"
        action={
          <Link
            to={ROUTES.SETTINGS}
            className="ledger-control inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
            title="Tune sensitivity, threshold, and which anomaly types are active"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Tune detection</span>
          </Link>
        }
      />

      <AnomalyDetectionPanel />

      {review.isLoading && <PageSkeleton />}

      {!review.isLoading && review.isError && (
        <ErrorState
          variant="card"
          title="Unable to load anomalies"
          message="We couldn't load your anomaly review data. Try again before reviewing financial activity."
          onRetry={review.retry}
        />
      )}

      {!review.isLoading && !review.isError && (
        <>
          <AnomalySummary summary={review.summary} />
          <AnomalyFilters
            typeFilter={review.typeFilter}
            severityFilter={review.severityFilter}
            includeReviewed={review.includeReviewed}
            onTypeFilterChange={review.setTypeFilter}
            onSeverityFilterChange={review.setSeverityFilter}
            onIncludeReviewedChange={review.setIncludeReviewed}
          />

          {review.sortedAnomalies.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No anomalies detected"
              description="Your financial data looks normal. Anomalies will appear here when unusual patterns are detected."
            />
          ) : (
            <AnomalyList
              anomalies={review.sortedAnomalies}
              expandedNoteId={review.expandedNoteId}
              noteText={review.noteText}
              isReviewPending={review.isReviewPending}
              onToggleNote={review.toggleNote}
              onNoteTextChange={review.setNoteText}
              onReview={review.handleReview}
            />
          )}
        </>
      )}
    </PageContainer>
  )
}
