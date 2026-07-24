import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useAnomalies, useReviewAnomaly } from '@/hooks/api/useAnalyticsV2'
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
  const summaryQuery = useAnomalies({ include_reviewed: includeReviewed })
  const reviewMutation = useReviewAnomaly()
  const { guardDemoAction } = useDemoGuard()

  const summary = useMemo<AnomalySummaryCounts>(() => {
    const allAnomalies = summaryQuery.data ?? []
    return {
      high: allAnomalies.filter((anomaly) => anomaly.severity === 'high').length,
      medium: allAnomalies.filter((anomaly) => anomaly.severity === 'medium').length,
      low: allAnomalies.filter((anomaly) => anomaly.severity === 'low').length,
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
