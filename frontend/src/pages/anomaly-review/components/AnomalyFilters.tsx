import { motion } from 'framer-motion'

import { Select } from '@/components/ui'

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'high_expense', label: 'High Expense' },
  { value: 'unusual_category', label: 'Unusual Category' },
  { value: 'large_transfer', label: 'Large Transfer' },
  { value: 'budget_exceeded', label: 'Budget Exceeded' },
  { value: 'closed_account_activity', label: 'Closed Account Activity' },
]

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
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
      className="glass rounded-2xl border border-border p-4 sm:p-6"
    >
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <div className="w-full sm:w-56">
          <Select
            value={typeFilter}
            onChange={(event) => onTypeFilterChange(event.target.value)}
            aria-label="Filter by anomaly type"
            options={TYPE_OPTIONS}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={severityFilter}
            onChange={(event) => onSeverityFilterChange(event.target.value)}
            aria-label="Filter by severity"
            options={SEVERITY_OPTIONS}
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground sm:min-h-0">
          <input
            type="checkbox"
            checked={includeReviewed}
            onChange={(event) => onIncludeReviewedChange(event.target.checked)}
            className="rounded border-border-strong bg-surface-dropdown"
          />
          <span>Include Reviewed</span>
        </label>
      </div>
    </motion.div>
  )
}
