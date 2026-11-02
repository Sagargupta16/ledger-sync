import { AlertTriangle, Settings2 } from 'lucide-react'
import { Link } from 'react-router'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader, StickyToolbar } from '@/components/ui'
import { ROUTES } from '@/constants'

import AnomalyDetectionPanel from './anomaly-review/components/AnomalyDetectionPanel'
import AnomalyFilters from './anomaly-review/components/AnomalyFilters'
import AnomalyList from './anomaly-review/components/AnomalyList'
import AnomalySummary from './anomaly-review/components/AnomalySummary'
import { useAnomalyReview } from './anomaly-review/useAnomalyReview'

export default function AnomalyReviewPage() {
  const review = useAnomalyReview()
  const tuneDetectionLink = (
    <Link
      to={ROUTES.SETTINGS}
      className="ledger-control inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground lg:pointer-fine:min-h-9"
      title="The expense threshold is also in Settings; turn checks on or off in the detection panel on this page"
    >
      <Settings2 className="w-3.5 h-3.5" />
      <span>Tune detection</span>
    </Link>
  )

  // The tuning link and detection panel do not depend on the failed queries,
  // so they stay usable on error. One root tree for every state keeps the
  // panel mounted, with its unsaved edits, across loading, error and loaded.
  const hasError = !review.isLoading && review.isError
  const filtered = Boolean(review.typeFilter || review.severityFilter) && review.summary.total > 0

  return (
    <PageContainer>
      <PageHeader
        title="Anomaly Review"
        subtitle="Review and manage detected financial anomalies"
        action={tuneDetectionLink}
      />

      <AnomalyDetectionPanel />

      {review.isLoading && <PageSkeleton />}

      {hasError && (
        <ErrorState
          title="Unable to load Anomaly Review"
          message="We couldn't load your anomaly review data. Try again before reviewing financial activity."
          onRetry={review.retry}
          errorType="network"
          variant="card"
        />
      )}

      {!review.isLoading && !hasError && (
        <>
          <AnomalySummary summary={review.summary} />
          {/* Stays above the list it filters and pins once scrolled to. */}
          <StickyToolbar label="Anomaly filters">
            <AnomalyFilters
              typeFilter={review.typeFilter}
              severityFilter={review.severityFilter}
              includeReviewed={review.includeReviewed}
              onTypeFilterChange={review.setTypeFilter}
              onSeverityFilterChange={review.setSeverityFilter}
              onIncludeReviewedChange={review.setIncludeReviewed}
            />
          </StickyToolbar>

          {review.sortedAnomalies.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title={filtered ? 'No anomalies match these filters' : 'No anomalies detected'}
              description={
                filtered
                  ? 'Clear the type or severity filter to see the other anomalies.'
                  : 'Your financial data looks normal. Anomalies will appear here when unusual patterns are detected.'
              }
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
