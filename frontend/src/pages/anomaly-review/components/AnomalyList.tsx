import { useState } from 'react'

import { Button } from '@/components/ui'
import type { Anomaly } from '@/hooks/api/useAnalyticsV2'

import AnomalyCard from './AnomalyCard'

/**
 * Cards per step. A read can return 200 rows, and every card animates its
 * position, so opening one note would re-measure them all on a phone.
 */
const STEP = 50

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
  const [visible, setVisible] = useState(STEP)
  const shown = anomalies.slice(0, visible)
  const remaining = anomalies.length - shown.length

  return (
    <div className="space-y-3">
      {shown.map((anomaly) => (
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
      {remaining > 0 && (
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <Button type="button" variant="secondary" onClick={() => setVisible((n) => n + STEP)}>
            Show {Math.min(STEP, remaining)} more
          </Button>
          <p className="text-xs text-text-tertiary tabular-nums">
            Showing {shown.length} of {anomalies.length}
          </p>
        </div>
      )}
    </div>
  )
}
