import { useState, useMemo } from 'react'

import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, HelpCircle, ArrowRightLeft, AlertTriangle, AlertCircle, Info, Check, X, ChevronDown, ChevronUp, Settings2, Save, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader, StatCard, CollapsibleSection } from '@/components/ui'
import { ROUTES } from '@/constants'
import { useAnomalies, useReviewAnomaly } from '@/hooks/api/useAnalyticsV2'
import type { Anomaly } from '@/hooks/api/useAnalyticsV2'
import { usePreferences, useUpdateAnomalySettings } from '@/hooks/api/usePreferences'
import type { LocalPrefs, LocalPrefKey } from '@/pages/settings/types'
import AnomalyDetectionSubsection from '@/pages/settings/sections/AnomalyDetectionSubsection'
import { formatCurrency, formatPercent, formatDate } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import EmptyState from '@/components/shared/EmptyState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import ProgressBar from '@/components/shared/ProgressBar'
import { useDemoGuard } from '@/hooks/useDemoGuard'

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

// Distinct icon per severity so the level reads without relying on colour alone.
const SEVERITY_ICONS: Record<Anomaly['severity'], typeof AlertTriangle> = {
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
}

const SEVERITY_STYLES: Record<Anomaly['severity'], { bg: string; text: string; border: string; borderLeft: string; iconColor: string }> = {
  high: { bg: 'bg-app-red/15', text: 'text-app-red', border: 'border-app-red/20', borderLeft: 'border-l-4 border-l-app-red', iconColor: rawColors.app.red },
  medium: { bg: 'bg-app-orange/15', text: 'text-app-orange', border: 'border-app-orange/20', borderLeft: 'border-l-4 border-l-app-orange', iconColor: rawColors.app.orange },
  low: { bg: 'bg-app-yellow/15', text: 'text-app-yellow', border: 'border-app-yellow/20', borderLeft: 'border-l-4 border-l-app-yellow', iconColor: rawColors.app.yellow },
}

const DETECTED_AT_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

/**
 * Contextual Anomaly Detection panel. Reuses the Settings
 * `AnomalyDetectionSubsection` as-is and saves the same fields via the
 * dedicated anomaly-settings preferences endpoint. The Settings page keeps its
 * own copy.
 */
function AnomalyDetectionPanel() {
  const { data: preferences } = usePreferences()
  const updateAnomalySettings = useUpdateAnomalySettings()
  const { guardDemoAction } = useDemoGuard()

  const [edits, setEdits] = useState<
    Partial<
      Pick<
        LocalPrefs,
        'anomaly_expense_threshold' | 'anomaly_types_enabled' | 'auto_dismiss_recurring_anomalies'
      >
    >
  >({})
  const [hasChanges, setHasChanges] = useState(false)

  const localPrefs = useMemo<LocalPrefs | null>(
    () => (preferences ? ({ ...preferences, ...edits } as unknown as LocalPrefs) : null),
    [preferences, edits],
  )

  const updateLocalPref = <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
    setEdits((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!localPrefs || guardDemoAction('Saving anomaly settings')) return
    try {
      await updateAnomalySettings.mutateAsync({
        anomaly_expense_threshold: localPrefs.anomaly_expense_threshold,
        anomaly_types_enabled: localPrefs.anomaly_types_enabled,
        auto_dismiss_recurring_anomalies: localPrefs.auto_dismiss_recurring_anomalies,
      })
      setHasChanges(false)
      setEdits({})
      toast.success('Anomaly settings saved')
    } catch {
      toast.error('Failed to save anomaly settings')
    }
  }

  if (!localPrefs) return null

  return (
    <CollapsibleSection title="Anomaly Detection" icon={SlidersHorizontal} defaultExpanded={false}>
      <AnomalyDetectionSubsection localPrefs={localPrefs} updateLocalPref={updateLocalPref} />
      <div className="flex items-center justify-end gap-3 pt-4">
        {hasChanges && (
          <span className="text-sm text-app-yellow flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-app-yellow animate-pulse" /> Unsaved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || updateAnomalySettings.isPending}
          className="flex items-center gap-2 px-4 py-2.5 sm:py-2 min-h-11 rounded-lg bg-gradient-to-r from-primary to-secondary text-on-accent text-sm font-medium transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {updateAnomalySettings.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </CollapsibleSection>
  )
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

  // Summary cards count every anomaly (ignoring the type/severity filters) so
  // the tally reflects the full picture, not just the currently-filtered list.
  const { data: allAnomalies = [] } = useAnomalies({ include_reviewed: includeReviewed })

  const reviewMutation = useReviewAnomaly()
  const { guardDemoAction } = useDemoGuard()

  const summary = useMemo(() => {
    const high = allAnomalies.filter((a) => a.severity === 'high').length
    const medium = allAnomalies.filter((a) => a.severity === 'medium').length
    const low = allAnomalies.filter((a) => a.severity === 'low').length
    return { high, medium, low }
  }, [allAnomalies])

  // Newest-first so the most recently detected anomalies surface at the top.
  const sortedAnomalies = useMemo(
    () =>
      [...anomalies].sort(
        (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
      ),
    [anomalies],
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
      },
    )
  }

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
      <PageHeader
        title="Anomaly Review"
        subtitle="Review and manage detected financial anomalies"
        action={
          <Link
            to={ROUTES.SETTINGS}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-[var(--overlay-1)] hover:bg-[var(--overlay-2)] text-muted-foreground hover:text-foreground transition-colors"
            title="Tune sensitivity, threshold, and which anomaly types are active"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Tune detection</span>
          </Link>
        }
      />

      <AnomalyDetectionPanel />

      {/* Summary Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5"
      >
        <motion.div variants={fadeUpItem}>
          <StatCard title="High Severity" value={String(summary.high)} icon={<AlertTriangle className="w-5 h-5" />} iconColor={SEVERITY_STYLES.high.iconColor} />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard title="Medium Severity" value={String(summary.medium)} icon={<AlertCircle className="w-5 h-5" />} iconColor={SEVERITY_STYLES.medium.iconColor} />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard title="Low Severity" value={String(summary.low)} icon={<Info className="w-5 h-5" />} iconColor={SEVERITY_STYLES.low.iconColor} />
        </motion.div>
      </motion.div>

      {/* Severity mix as a 100% stacked strip -- the proportional split the
          three count cards imply, without a separate chart. */}
      {summary.high + summary.medium + summary.low > 0 && (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full"
          role="img"
          aria-label={`Severity mix: ${summary.high} high, ${summary.medium} medium, ${summary.low} low`}
        >
          {([
            ['high', summary.high],
            ['medium', summary.medium],
            ['low', summary.low],
          ] as const).map(([sev, count]) => (
            <div
              key={sev}
              style={{
                width: `${(count / (summary.high + summary.medium + summary.low)) * 100}%`,
                backgroundColor: SEVERITY_STYLES[sev].iconColor,
              }}
            />
          ))}
        </div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by anomaly type"
            className="px-3 py-2.5 bg-surface-dropdown/80 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-app-purple/50"
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
            aria-label="Filter by severity"
            className="px-3 py-2.5 bg-surface-dropdown/80 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-app-purple/50"
          >
            <option value="">All Severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={includeReviewed}
              onChange={(e) => setIncludeReviewed(e.target.checked)}
              className="rounded border-border-strong bg-surface-dropdown"
            />{' '}
            Include Reviewed
          </label>
        </div>
      </motion.div>

      {/* Anomaly List */}
      {isLoading && <PageSkeleton />}
      {!isLoading && anomalies.length === 0 && (
        <EmptyState
          icon={AlertTriangle}
          title="No anomalies detected"
          description="Your financial data looks normal. Anomalies will appear here when unusual patterns are detected."
        />
      )}
      {!isLoading && anomalies.length > 0 && (
        <div className="space-y-3">
          {sortedAnomalies.map((anomaly) => {
            const TypeIcon = ANOMALY_TYPE_ICONS[anomaly.anomaly_type]
            const SeverityIcon = SEVERITY_ICONS[anomaly.severity]
            const severity = SEVERITY_STYLES[anomaly.severity]
            const isExpanded = expandedNoteId === anomaly.id

            return (
              <motion.div
                key={anomaly.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass rounded-2xl border p-4 sm:p-6 ${severity.borderLeft} ${anomaly.is_reviewed ? 'border-border opacity-60' : 'border-border'}`}
              >
                {/* Header Row */}
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
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${severity.bg} ${severity.text} ${severity.border}`}>
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
                    {formatDate(anomaly.detected_at, DETECTED_AT_OPTS)}
                  </span>
                </div>

                {/* Expected vs Actual -- paired mini-bars on a shared scale so the
                    gap between baseline and observed reads at a glance. */}
                {anomaly.expected_value != null && anomaly.actual_value != null && (() => {
                  const scaleMax = Math.max(
                    Math.abs(anomaly.expected_value),
                    Math.abs(anomaly.actual_value),
                  )
                  const overBaseline = (anomaly.deviation_pct ?? 0) >= 0
                  const actualColor = overBaseline ? rawColors.app.red : rawColors.app.green
                  return (
                    <div className="mt-3 ml-0 sm:ml-11 space-y-1.5 max-w-md">
                      <div className="flex items-center justify-between gap-3">
                        <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2 flex-1">
                          <span className="text-xs text-text-tertiary">Expected</span>
                          <ProgressBar
                            value={Math.abs(anomaly.expected_value)}
                            max={scaleMax}
                            height={6}
                            color={rawColors.text.tertiary}
                            ariaLabel={`Expected ${formatCurrency(anomaly.expected_value)}`}
                          />
                          <span className="text-xs text-foreground tabular-nums text-right">
                            {formatCurrency(anomaly.expected_value)}
                          </span>
                        </div>
                        {anomaly.deviation_pct != null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${overBaseline ? 'bg-app-red/10 text-app-red' : 'bg-app-green/10 text-app-green'}`}>
                            {anomaly.deviation_pct > 0 ? '+' : ''}{formatPercent(anomaly.deviation_pct / 100)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
                        <span className="text-xs text-text-tertiary">Actual</span>
                        <ProgressBar
                          value={Math.abs(anomaly.actual_value)}
                          max={scaleMax}
                          height={6}
                          color={actualColor}
                          target={Math.abs(anomaly.expected_value)}
                          ariaLabel={`Actual ${formatCurrency(anomaly.actual_value)}`}
                        />
                        <span className="text-xs text-foreground font-medium tabular-nums text-right">
                          {formatCurrency(anomaly.actual_value)}
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* Review Notes */}
                {anomaly.review_notes && (
                  <div className="mt-3 ml-0 sm:ml-11 text-xs text-text-tertiary italic">
                    Note: {anomaly.review_notes}
                  </div>
                )}

                {/* Actions */}
                {!anomaly.is_reviewed && (
                  <div className="mt-4 ml-0 sm:ml-11 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleReview(anomaly.id, false)}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-11 text-xs rounded-lg bg-app-green/10 text-app-green border border-app-green/20 hover:bg-app-green/20 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> Review
                      </button>
                      <button
                        onClick={() => handleReview(anomaly.id, true)}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-11 text-xs rounded-lg bg-app-red/10 text-app-red border border-app-red/20 hover:bg-app-red/20 transition-colors disabled:opacity-50"
                      >
                        <X className="w-3 h-3" /> Dismiss
                      </button>
                      <button
                        onClick={() => {
                          setExpandedNoteId(isExpanded ? null : anomaly.id)
                          setNoteText('')
                        }}
                        className="flex items-center gap-1 px-3 py-2.5 min-h-11 text-xs rounded-lg bg-[var(--overlay-2)] text-muted-foreground border border-border hover:bg-[var(--overlay-5)] transition-colors"
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
                            aria-label="Add review notes"
                            className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-purple/50"
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
    </div>
  )
}
