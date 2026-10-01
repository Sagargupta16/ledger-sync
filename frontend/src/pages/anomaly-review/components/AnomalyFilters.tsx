import { motion } from 'motion/react'

import { Select } from '@/components/ui'
import { EMITTED_ANOMALY_SEVERITIES } from '@/services/api/analyticsV2'

import { ANOMALY_TYPE_FILTER_OPTIONS, SEVERITY_LABELS } from '../constants'

/**
 * Only severities a detector writes. `anomalies.py` grades everything `"high"` or
 * `"medium"`, so the `Low` option this list used to carry selected an
 * always-empty result -- a control whose only possible outcome is "no anomalies
 * detected" on a page that has anomalies.
 */
const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  ...EMITTED_ANOMALY_SEVERITIES.map((severity) => ({
    value: severity,
    label: SEVERITY_LABELS[severity],
  })),
]

interface Props {
  typeFilter: string
  severityFilter: string
  includeReviewed: boolean
  onTypeFilterChange: (value: string) => void
  onSeverityFilterChange: (value: string) => void
  onIncludeReviewedChange: (value: boolean) => void
}

export default function AnomalyFilters({
  typeFilter,
  severityFilter,
  includeReviewed,
  onTypeFilterChange,
  onSeverityFilterChange,
  onIncludeReviewedChange,
}: Readonly<Props>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ledger-panel p-3 sm:p-4"
    >
      {/* Type and severity share a row on a phone, so the pinned filter bar
          stays two rows tall. */}
      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1 sm:flex sm:flex-wrap sm:gap-4">
        <div className="min-w-0 sm:w-56">
          <Select
            value={typeFilter}
            onChange={(event) => onTypeFilterChange(event.target.value)}
            aria-label="Filter by anomaly type"
            options={[...ANOMALY_TYPE_FILTER_OPTIONS]}
          />
        </div>
        <div className="min-w-0 sm:w-48">
          <Select
            value={severityFilter}
            onChange={(event) => onSeverityFilterChange(event.target.value)}
            aria-label="Filter by severity"
            options={SEVERITY_OPTIONS}
          />
        </div>
        <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground lg:pointer-fine:min-h-8">
          <input
            type="checkbox"
            checked={includeReviewed}
            onChange={(event) => onIncludeReviewedChange(event.target.checked)}
            aria-label="Include reviewed anomalies"
            className="rounded border-border-strong bg-surface-dropdown"
          />
          <span>Include Reviewed</span>
        </label>
      </div>
    </motion.div>
  )
}
