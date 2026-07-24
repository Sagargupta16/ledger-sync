import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'

import { Button, Input } from '@/components/ui'
import type { Anomaly } from '@/hooks/api/useAnalyticsV2'
import { formatDate } from '@/lib/formatters'

import {
  ANOMALY_TYPE_ICONS,
  ANOMALY_TYPE_LABELS,
  DETECTED_AT_OPTIONS,
  SEVERITY_ICONS,
  SEVERITY_STYLES,
} from '../constants'
import AnomalyValueComparison from './AnomalyValueComparison'

interface Props {
  anomaly: Anomaly
  isExpanded: boolean
  noteText: string
  isReviewPending: boolean
  onToggleNote: (anomalyId: number) => void
  onNoteTextChange: (value: string) => void
  onReview: (anomalyId: number, dismiss: boolean) => void
}

export default function AnomalyCard({
  anomaly,
  isExpanded,
  noteText,
  isReviewPending,
  onToggleNote,
  onNoteTextChange,
  onReview,
}: Readonly<Props>) {
  const TypeIcon = ANOMALY_TYPE_ICONS[anomaly.anomaly_type]
  const SeverityIcon = SEVERITY_ICONS[anomaly.severity]
  const severity = SEVERITY_STYLES[anomaly.severity]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`ledger-panel p-4 sm:p-5 ${anomaly.is_reviewed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${severity.bg}`}>
            <TypeIcon className={`w-4 h-4 ${severity.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {ANOMALY_TYPE_LABELS[anomaly.anomaly_type]}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${severity.bg} ${severity.text} ${severity.border}`}
              >
                <SeverityIcon className="w-3 h-3" />
                {anomaly.severity}
              </span>
              {anomaly.is_reviewed && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-app-green/10 text-app-green border border-app-green/20">
                  {anomaly.is_dismissed ? 'Dismissed' : 'Reviewed'}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{anomaly.description}</p>
          </div>
        </div>
        <span className="text-xs text-text-tertiary whitespace-nowrap">
          {formatDate(anomaly.detected_at, DETECTED_AT_OPTIONS)}
        </span>
      </div>

      <AnomalyValueComparison anomaly={anomaly} />

      {anomaly.review_notes && (
        <div className="mt-3 ml-0 sm:ml-11 text-xs text-text-tertiary italic">
          Note: {anomaly.review_notes}
        </div>
      )}

      {!anomaly.is_reviewed && (
        <div className="mt-4 ml-0 sm:ml-11 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Check className="w-3 h-3" />}
              onClick={() => onReview(anomaly.id, false)}
              disabled={isReviewPending}
              className="border-app-green/20 bg-app-green/10 text-app-green hover:bg-app-green/20"
            >
              Review
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<X className="w-3 h-3" />}
              onClick={() => onReview(anomaly.id, true)}
              disabled={isReviewPending}
              className="border-app-red/20 bg-app-red/10 text-app-red hover:bg-app-red/20"
            >
              Dismiss
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={
                isExpanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )
              }
              onClick={() => onToggleNote(anomaly.id)}
            >
              Add Note
            </Button>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Input
                  type="text"
                  value={noteText}
                  onChange={(event) => onNoteTextChange(event.target.value)}
                  placeholder="Add review notes..."
                  aria-label="Add review notes"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}
