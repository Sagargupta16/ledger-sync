import { Upload } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import { PanelSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader } from '@/components/ui'
import { ROUTES } from '@/constants'

import CategoryPicker from './components/CategoryPicker'
import ReviewControls from './components/ReviewControls'
import ReviewDeck from './components/ReviewDeck'
import ReviewEndState from './components/ReviewEndState'
import ReviewProgress from './components/ReviewProgress'
import { useReviewQueue } from './useReviewQueue'

const TITLE = 'Review Queue'
const SUBTITLE =
  'Confirm or fix the category of your newest transactions, one card at a time. A fix stays through every later import.'

export default function ReviewQueuePage() {
  const review = useReviewQueue()

  if (review.isError) {
    return (
      <PageErrorState
        title={TITLE}
        subtitle={SUBTITLE}
        maxWidth="4xl"
        message="We could not load your review queue. Your saved reviews are unchanged. Try again."
        onRetry={review.retry}
      />
    )
  }

  return (
    <PageContainer maxWidth="4xl">
      <PageHeader title={TITLE} subtitle={SUBTITLE} />

      {review.isLoading && (
        <div className="mx-auto w-full max-w-md">
          <PanelSkeleton blockClassName="h-56" />
        </div>
      )}

      {!review.isLoading && review.isEmptyLedger && (
        <EmptyState
          icon={Upload}
          variant="card"
          title="Nothing to review yet"
          description="Import a statement or a Money Manager backup, and its income and expense rows queue up here."
          actionLabel="Upload & Sync"
          actionHref={ROUTES.UPLOAD}
        />
      )}

      {!review.isLoading && review.isDone && !review.isEmptyLedger && (
        <ReviewEndState
          kept={review.session.kept}
          changed={review.session.changed}
          windowDays={review.progress?.windowDays ?? 30}
          isRefreshing={review.isRefreshing}
          isDemoMode={review.isDemoMode}
          canUndo={review.canUndo}
          onUndo={review.undo}
        />
      )}

      {!review.isLoading && review.current && (
        <section aria-label="Transactions to review" className="space-y-5">
          {review.progress && <ReviewProgress counts={review.progress} />}
          <ReviewDeck
            current={review.current}
            next={review.next}
            deckMotion={review.deckMotion}
            onKeep={review.keep}
            onChange={review.openPicker}
          />
          <ReviewControls
            canUndo={review.canUndo}
            onKeep={review.keep}
            onChange={review.openPicker}
            onUndo={review.undo}
          />
        </section>
      )}

      <CategoryPicker
        open={review.pickerOpen}
        item={review.current}
        options={review.options}
        onPick={review.change}
        onClose={review.closePicker}
      />
    </PageContainer>
  )
}
