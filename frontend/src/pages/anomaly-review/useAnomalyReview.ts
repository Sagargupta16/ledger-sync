import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { useAnomalies, useAnomalyCounts, useReviewAnomaly } from '@/hooks/api/useAnalyticsV2'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import type { Anomaly } from '@/services/api/analyticsV2Anomalies'

import { ANOMALY_TYPE_ORDER, reviewCopy, typeRank } from './typeCopy'
import type { AnomalySummaryCounts } from './types'

/**
 * Rows per read: the handler's ceiling. The engine caps each type per refresh,
 * so one refresh's open rows fit; reviewed history beyond it stays in `count`.
 */
const PAGE_LIMIT = 200
/** The type filter lives in the URL, so `/anomalies?type=fee_charge` deep-links. */
const TYPE_PARAM = 'type'
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

/** Open first, then the type's priority, severity, the newest month, backend order. */
function byPriority(a: Anomaly, b: Anomaly): number {
  return (
    Number(a.is_reviewed) - Number(b.is_reviewed) ||
    typeRank(a.anomaly_type) - typeRank(b.anomaly_type) ||
    (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
    (b.period_key ?? '').localeCompare(a.period_key ?? '') ||
    a.id - b.id
  )
}

/**
 * The type filter, kept in the URL. Written with `replace`, so Back leaves the
 * page instead of stepping through filter changes. The filter select and the
 * type chips both write through this.
 */
export function useTypeFilterParam(): readonly [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const setTypeFilter = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(TYPE_PARAM, value)
    else next.delete(TYPE_PARAM)
    setSearchParams(next, { replace: true })
  }
  return [searchParams.get(TYPE_PARAM) ?? '', setTypeFilter]
}

function scopeSummary(rows: readonly Anomaly[]): Pick<AnomalySummaryCounts, 'byType' | 'fees'> {
  const perType = new Map<string, number>()
  const fees = { count: 0, total: 0 }
  for (const row of rows) {
    perType.set(row.anomaly_type, (perType.get(row.anomaly_type) ?? 0) + 1)
    if (row.anomaly_type === 'fee_charge' && !row.is_dismissed) {
      fees.count += 1
      fees.total += row.actual_value ?? 0
    }
  }
  const byType = ANOMALY_TYPE_ORDER.flatMap((type) => {
    const count = perType.get(type)
    return count ? [{ type, count }] : []
  })
  return { byType, fees }
}

export function useAnomalyReview() {
  const [typeFilter, setTypeFilter] = useTypeFilterParam()
  const [severityFilter, setSeverityFilter] = useState('')
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')

  const anomaliesQuery = useAnomalies({
    type: typeFilter || undefined,
    severity: severityFilter || undefined,
    include_reviewed: includeReviewed,
    limit: PAGE_LIMIT,
  })
  // The unfiltered list for the per-type tally; the same query as the list when
  // no filter is set, so it costs a request only while one is.
  const scopeQuery = useAnomalies({ include_reviewed: includeReviewed, limit: PAGE_LIMIT })
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
      ...scopeSummary(scopeQuery.data ?? []),
    }
  }, [summaryQuery.data, scopeQuery.data])

  const sortedAnomalies = useMemo(
    () => [...(anomaliesQuery.data ?? [])].sort(byPriority),
    [anomaliesQuery.data],
  )

  const handleReview = (anomalyId: number, dismiss: boolean) => {
    if (guardDemoAction('Reviewing anomalies')) return
    const anomaly = sortedAnomalies.find((row) => row.id === anomalyId)
    const copy = anomaly ? reviewCopy(anomaly.anomaly_type) : undefined
    const choice = dismiss ? copy?.dismiss : copy?.review
    const typed = expandedNoteId === anomalyId ? noteText.trim() : ''
    // With no note typed, the chosen outcome becomes the note, so the reviewed
    // card still says what was decided ("Not a duplicate").
    const notes = typed || (copy?.recordChoice ? choice : undefined)
    reviewMutation.mutate(
      { anomalyId, data: { dismiss, notes } },
      {
        onSuccess: () => {
          if (copy?.recordChoice && choice) toast.success(`Saved: ${choice}`)
          else toast.success(dismiss ? 'Anomaly dismissed' : 'Anomaly reviewed')
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
    void Promise.all([anomaliesQuery.refetch(), summaryQuery.refetch(), scopeQuery.refetch()])
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
    // The per-type chips come from `scopeQuery`; counting it here keeps a failed
    // tally from silently dropping the chips while the list renders.
    isLoading: anomaliesQuery.isLoading || summaryQuery.isLoading || scopeQuery.isLoading,
    isError: anomaliesQuery.isError || summaryQuery.isError || scopeQuery.isError,
    isReviewPending: reviewMutation.isPending,
    retry,
    toggleNote,
    handleReview,
  }
}
