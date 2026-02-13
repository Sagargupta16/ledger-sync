import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, HelpCircle, ArrowRightLeft, AlertTriangle, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { PageHeader, StatCard } from '@/components/ui'
import { useAnomalies, useReviewAnomaly } from '@/hooks/api/useAnalyticsV2'
import type { Anomaly } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { toast } from 'sonner'
import EmptyState from '@/components/shared/EmptyState'

const ANOMALY_TYPE_LABELS: Record<Anomaly['anomaly_type'], string> = {
  high_expense: 'High Expense',
  unusual_category: 'Unusual Category',
  large_transfer: 'Large Transfer',
  budget_exceeded: 'Budget Exceeded',
}

const ANOMALY_TYPE_ICONS: Record<Anomaly['anomaly_type'], typeof TrendingUp> = {
  high_expense: TrendingUp,
  unusual_category: HelpCircle,
  large_transfer: ArrowRightLeft,
  budget_exceeded: AlertTriangle,
}

const SEVERITY_STYLES: Record<Anomaly['severity'], { bg: string; text: string; border: string }> = {
  high: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  low: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
}

export default function AnomalyReviewPage() {
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')

  const { data: anomalies = [], isLoading } = useAnomalies({
    type: typeFilter || undefined,
    severity: severityFilter || undefined,
    include_reviewed: includeReviewed,
  })

  const reviewMutation = useReviewAnomaly()

  const summary = useMemo(() => {
    const high = anomalies.filter((a) => a.severity === 'high').length
    const medium = anomalies.filter((a) => a.severity === 'medium').length
    const low = anomalies.filter((a) => a.severity === 'low').length
    return { high, medium, low }
  }, [anomalies])

  const handleReview = (anomalyId: number, dismiss: boolean) => {
    const notes = expandedNoteId === anomalyId ? noteText : undefined
    reviewMutation.mutate(
      { anomalyId, data: { dismiss, notes } },
      {
        onSuccess: () => {
          toast.success(dismiss ? 'Anomaly dismissed' : 'Anomaly reviewed')
          setExpandedNoteId(null)
          setNoteText('')
        },
      },
    )
  }

  return (
    <div className="p-8 space-y-8">
      <PageHeader
        title="Anomaly Review Board"
        subtitle="Review and manage detected financial anomalies"
      />

      {/* Summary Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-3 gap-5"
      >
        <motion.div variants={fadeUpItem}>
          <StatCard title="High Severity" value={String(summary.high)} icon={<AlertTriangle className="w-5 h-5" />} iconColor={rawColors.ios.red} />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard title="Medium Severity" value={String(summary.medium)} icon={<AlertTriangle className="w-5 h-5" />} iconColor={rawColors.ios.yellow} />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard title="Low Severity" value={String(summary.low)} icon={<AlertTriangle className="w-5 h-5" />} iconColor={rawColors.ios.blue} />
        </motion.div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-white/10 p-5"
      >
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800/80 border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-purple-500/50"
          >
            <option value="">All Types</option>
            <option value="high_expense">High Expense</option>
            <option value="unusual_category">Unusual Category</option>
            <option value="large_transfer">Large Transfer</option>
            <option value="budget_exceeded">Budget Exceeded</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800/80 border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-purple-500/50"
          >
            <option value="">All Severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeReviewed}
              onChange={(e) => setIncludeReviewed(e.target.checked)}
              className="rounded border-white/20 bg-gray-800"
            />{' '}
            Include Reviewed
          </label>
        </div>
      </motion.div>

      {/* Anomaly List */}
      {isLoading && (
        <div className="h-64 flex items-center justify-center text-muted-foreground">Loading anomalies...</div>
      )}
      {!isLoading && anomalies.length === 0 && (
        <EmptyState
          icon={AlertTriangle}
          title="No anomalies detected"
          description="Your financial data looks normal. Anomalies will appear here when unusual patterns are detected."
        />
      )}
      {!isLoading && anomalies.length > 0 && (
        <div className="space-y-3">
          {anomalies.map((anomaly) => {
            const TypeIcon = ANOMALY_TYPE_ICONS[anomaly.anomaly_type]
            const severity = SEVERITY_STYLES[anomaly.severity]
            const isExpanded = expandedNoteId === anomaly.id

            return (
              <motion.div
                key={anomaly.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass rounded-2xl border p-5 ${anomaly.is_reviewed ? 'border-white/5 opacity-60' : 'border-white/10'}`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${severity.bg}`}>
                      <TypeIcon className={`w-4 h-4 ${severity.text}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {ANOMALY_TYPE_LABELS[anomaly.anomaly_type]}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${severity.bg} ${severity.text} ${severity.border}`}>
                          {anomaly.severity}
                        </span>
                        {anomaly.is_reviewed && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                            {anomaly.is_dismissed ? 'Dismissed' : 'Reviewed'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{anomaly.description}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(anomaly.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                {/* Expected vs Actual */}
                {anomaly.expected_value != null && anomaly.actual_value != null && (
                  <div className="flex items-center gap-6 mt-3 ml-11">
                    <div className="text-xs">
                      <span className="text-gray-500">Expected: </span>
                      <span className="text-gray-300">{formatCurrency(anomaly.expected_value)}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-gray-500">Actual: </span>
                      <span className="text-white font-medium">{formatCurrency(anomaly.actual_value)}</span>
                    </div>
                    {anomaly.deviation_pct != null && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${anomaly.deviation_pct > 0 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                        {anomaly.deviation_pct > 0 ? '+' : ''}{formatPercent(anomaly.deviation_pct / 100)}
                      </span>
                    )}
                  </div>
                )}

                {/* Review Notes */}
                {anomaly.review_notes && (
                  <div className="mt-3 ml-11 text-xs text-gray-500 italic">
                    Note: {anomaly.review_notes}
                  </div>
                )}

                {/* Actions */}
                {!anomaly.is_reviewed && (
                  <div className="mt-4 ml-11 space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReview(anomaly.id, false)}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> Review
                      </button>
                      <button
                        onClick={() => handleReview(anomaly.id, true)}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        <X className="w-3 h-3" /> Dismiss
                      </button>
                      <button
                        onClick={() => {
                          setExpandedNoteId(isExpanded ? null : anomaly.id)
                          setNoteText('')
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Add Note
                      </button>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          <input
                            type="text"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add review notes..."
                            className="w-full px-3 py-2 bg-gray-800/80 border border-white/10 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-purple-500/50"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
