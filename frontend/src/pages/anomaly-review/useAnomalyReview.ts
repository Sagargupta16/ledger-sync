import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useAnomalies, useAnomalyCounts, useReviewAnomaly } from '@/hooks/api/useAnalyticsV2'
import { useDemoGuard } from '@/hooks/useDemoGuard'

import type { AnomalySummaryCounts } from './types'

export function useAnomalyReview() {
  const [typeFilter, setTypeFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')

  const anomaliesQuery = useAnomalies({
    type: typeFilter || undefined,
    severity: severityFilter || undefined,
    include_reviewed: includeReviewed,
  })
  const summaryQuery = useAnomalyCounts({ include_reviewed: includeReviewed })
  const reviewMutation = useReviewAnomaly()
  const { guardDemoAction } = useDemoGuard()

  // Envelope totals, not row counts: the row list stops at the handler's limit.
  // `total` is the match count, not high + medium: the severity column is free
  // text on the backend, so a row graded anything else still has to be counted
  // or the page would under-report how many anomalies exist.
  const summary = useMemo<AnomalySummaryCounts>(() => {
    const counts = summaryQuery.data
    return {
      high: counts?.summary.high ?? 0,
      medium: counts?.summary.medium ?? 0,
      total: counts?.count ?? 0,
    }
  }, [summaryQuery.data])

  const sortedAnomalies = useMemo(
    () =>
      [...(anomaliesQuery.data ?? [])].sort(
        (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
      ),
    [anomaliesQuery.data],
  )

  const handleReview = (anomalyId: number, dismiss: boolean) => {
    if (guardDemoAction('Reviewing anomalies')) return
    const notes = expandedNoteId === anomalyId ? noteText : undefined
    reviewMutation.mutate(
      { anomalyId, data: { dismiss, notes } },
      {
        onSuccess: () => {
          toast.success(dismiss ? 'Anomaly dismissed' : 'Anomaly reviewed')
          setExpandedNoteId(null)
          setNoteText('')
        },
        onError: () => {
          toast.error('Failed to update anomaly review')
        },
      },
    )
  }

  const toggleNote = (anomalyId: number) => {
    setExpandedNoteId((current) => (current === anomalyId ? null : anomalyId))
    setNoteText('')
  }

  const retry = () => {
    void Promise.all([anomaliesQuery.refetch(), summaryQuery.refetch()])
  }

  return {
    typeFilter,
    setTypeFilter,
    severityFilter,
    setSeverityFilter,
    includeReviewed,
    setIncludeReviewed,
    expandedNoteId,
    noteText,
    setNoteText,
    summary,
    sortedAnomalies,
    isLoading: anomaliesQuery.isLoading || summaryQuery.isLoading,
    isError: anomaliesQuery.isError || summaryQuery.isError,
    isReviewPending: reviewMutation.isPending,
    retry,
    toggleNote,
    handleReview,
  }
}
