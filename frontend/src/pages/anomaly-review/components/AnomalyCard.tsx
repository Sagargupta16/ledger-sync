import { motion } from 'motion/react'

import type { LucideIcon } from 'lucide-react'

import type { Anomaly } from '@/hooks/api/useAnalyticsV2'
import { formatDate } from '@/lib/formatters'

import {
  anomalyTypeIcon,
  anomalyTypeLabel,
  DETECTED_AT_OPTIONS,
  severityIcon,
  severityStyle,
} from '../constants'
import { reviewCopy } from '../typeCopy'
import AnomalyFacts from './AnomalyFacts'
import AnomalyReviewActions from './AnomalyReviewActions'
import AnomalyValueComparison from './AnomalyValueComparison'

/**
 * Renders a resolved icon component.
 *
 * The icon is chosen per anomaly at render time (via the `constants` accessors),
 * and binding that choice to a capitalized local is what `react-hooks/
 * static-components` rejects: React sees a fresh component identity each render
 * and remounts the subtree instead of updating it. Taking the icon as a PROP on
 * a module-level component is the repo's existing answer to this -- `MetricCard`,
 * `EmptyState` and `SidebarItem` declare `icon: LucideIcon`, `SummaryCard` a
 * `ComponentType`, and all destructure it as `icon: Icon`. Here the choice is
 * dynamic rather than caller-supplied, so the indirection lives in this file.
 */
function AnomalyIcon({ icon: Icon, className }: Readonly<{ icon: LucideIcon; className: string }>) {
  return <Icon className={className} />
}

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
  // Accessors, not direct indexing: both fields come off the wire, and an
  // unmapped one used to produce `undefined` in a className (or throw outright on
  // `severity.bg`) instead of degrading to a neutral chip.
  const typeIcon = anomalyTypeIcon(anomaly.anomaly_type)
  const sevIcon = severityIcon(anomaly.severity)
  const severity = severityStyle(anomaly.severity)

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`ledger-panel p-4 sm:p-5 ${anomaly.is_reviewed ? 'opacity-60' : ''}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`shrink-0 rounded-lg p-2 ${severity.bg}`}>
            <AnomalyIcon icon={typeIcon} className={`w-4 h-4 ${severity.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {anomalyTypeLabel(anomaly.anomaly_type)}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${severity.bg} ${severity.text} ${severity.border}`}
              >
                <AnomalyIcon icon={sevIcon} className="w-3 h-3" />
                {anomaly.severity}
              </span>
              {anomaly.is_reviewed && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-app-green/10 text-app-green border border-app-green/20">
                  {anomaly.is_dismissed ? 'Dismissed' : 'Reviewed'}
                </span>
              )}
            </div>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {anomaly.description}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              {reviewCopy(anomaly.anomaly_type).explanation}
            </p>
          </div>
        </div>
        <span className="self-end whitespace-nowrap text-xs text-text-tertiary sm:self-auto">
          {formatDate(anomaly.detected_at, DETECTED_AT_OPTIONS)}
        </span>
      </div>

      <AnomalyFacts anomaly={anomaly} />
      <AnomalyValueComparison anomaly={anomaly} />

      {anomaly.review_notes && (
        <div className="mt-3 ml-0 sm:ml-11 text-xs text-text-tertiary italic">
          Note: {anomaly.review_notes}
        </div>
      )}

      {!anomaly.is_reviewed && (
        <AnomalyReviewActions
          anomaly={anomaly}
          isExpanded={isExpanded}
          noteText={noteText}
          isReviewPending={isReviewPending}
          onToggleNote={onToggleNote}
          onNoteTextChange={onNoteTextChange}
          onReview={onReview}
        />
      )}
    </motion.div>
  )
}
