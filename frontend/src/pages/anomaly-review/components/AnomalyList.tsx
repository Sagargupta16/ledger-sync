import type { Anomaly } from '@/hooks/api/useAnalyticsV2'

import AnomalyCard from './AnomalyCard'

interface Props {
  anomalies: Anomaly[]
  expandedNoteId: number | null
  noteText: string
  isReviewPending: boolean
  onToggleNote: (anomalyId: number) => void
  onNoteTextChange: (value: string) => void
  onReview: (anomalyId: number, dismiss: boolean) => void
}

export default function AnomalyList({
  anomalies,
  expandedNoteId,
  noteText,
  isReviewPending,
  onToggleNote,
  onNoteTextChange,
  onReview,
}: Readonly<Props>) {
  return (
    <div className="space-y-3">
      {anomalies.map((anomaly) => (
        <AnomalyCard
          key={anomaly.id}
          anomaly={anomaly}
          isExpanded={expandedNoteId === anomaly.id}
          noteText={noteText}
          isReviewPending={isReviewPending}
          onToggleNote={onToggleNote}
          onNoteTextChange={onNoteTextChange}
          onReview={onReview}
        />
      ))}
    </div>
  )
}
