import { useMemo, useState } from 'react'

import { motion } from 'framer-motion'
import { Calendar, TrendingUp } from 'lucide-react'
import { useCohortSpending } from '@/hooks/api/useAnalyticsV2'
import { rawColors } from '@/constants/colors'
import StandardBarChart from '@/components/analytics/StandardBarChart'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { formatCurrencyShort } from '@/lib/formatters'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type ViewMode = 'day-of-week' | 'day-of-month' | 'monthly'

interface BarDatum {
  name: string
  avg: number
}

/**
 * Spending Patterns -- average spending bucketed by day-of-week,
 * day-of-month, or month-of-year. Three views share the same bar chart;
 * an insight strip below the chart calls out the highest/lowest bucket
 * with the absolute amount so users get a takeaway without hovering.
 */
export default function CohortSpendingAnalysis() {
  const { data: cohort } = useCohortSpending()
  const [view, setView] = useState<ViewMode>('day-of-week')

  // The backend pre-computes total / occurrence-correct divisor per bucket and
  // returns `avg` directly (day-of-week in JS Sun..Sat order, day-of-month
  // 1..31, month-of-year 1..12). The client just maps buckets to labels --
  // moving the date bucketing server-side also removed the timezone bug class.
  const dowData = useMemo<BarDatum[]>(() => {
    const byBucket = new Map((cohort?.day_of_week ?? []).map((b) => [b.bucket, b.avg]))
    return DAY_NAMES.map((name, i) => ({ name, avg: Math.round(byBucket.get(i) ?? 0) }))
  }, [cohort])

  const domData = useMemo<BarDatum[]>(() => {
    const byBucket = new Map((cohort?.day_of_month ?? []).map((b) => [b.bucket, b.avg]))
    return Array.from({ length: 31 }, (_, i) => ({
      name: String(i + 1),
      avg: Math.round(byBucket.get(i + 1) ?? 0),
    }))
  }, [cohort])

  const monthlyData = useMemo<BarDatum[]>(() => {
    const byBucket = new Map((cohort?.month_of_year ?? []).map((b) => [b.bucket, b.avg]))
    return MONTH_NAMES.map((name, i) => ({ name, avg: Math.round(byBucket.get(i + 1) ?? 0) }))
  }, [cohort])

  const dataByView: Record<ViewMode, BarDatum[]> = {
    'day-of-week': dowData,
    'day-of-month': domData,
    'monthly': monthlyData,
  }
  const currentData = dataByView[view]
  const hasData = currentData.some((d) => d.avg > 0)

  // Compute peak / dip insights for the active view so the user gets a
  // takeaway without having to hover.
  const insights = useMemo(() => {
    if (!hasData) return null
    const nonzero = currentData.filter((d) => d.avg > 0)
    if (nonzero.length === 0) return null
    const sorted = [...nonzero].sort((a, b) => b.avg - a.avg)
    const total = nonzero.reduce((sum, d) => sum + d.avg, 0)
    const mean = total / nonzero.length
    const peak = sorted[0]
    const peakDelta = mean > 0 ? (peak.avg - mean) / mean : 0
    return {
      peakName: peak.name,
      peakAmount: peak.avg,
      peakDelta,
      dipName: sorted.at(-1)?.name,
    }
  }, [currentData, hasData])

  const peakName = insights?.peakName

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-app-teal" />
          <h3 className="text-lg font-semibold text-foreground">Spending Patterns</h3>
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg bg-muted/20">
          {([
            ['day-of-week', 'By Day'],
            ['day-of-month', 'By Date'],
            ['monthly', 'Seasonal'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`px-2.5 py-2.5 min-h-11 rounded-md text-xs font-medium transition-colors ${view === key ? 'bg-[var(--overlay-5)] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        {view === 'day-of-week' && 'Average spending by day of the week'}
        {view === 'day-of-month' && 'Average spending by day of the month (highlights payday spending spikes)'}
        {view === 'monthly' && 'Average monthly spending across years (highlights festival season Oct-Dec)'}
      </p>

      {hasData ? (
        <>
          <div role="img" aria-label={viewAriaLabel(view)}>
            <StandardBarChart
              data={currentData}
              dataKey="name"
              height={260}
              bars={[
                {
                  key: 'avg',
                  label: 'Avg Spending',
                  color: rawColors.app.teal,
                  fillOpacity: 0.7,
                  barSize: view === 'day-of-month' ? 14 : 30,
                },
              ]}
              showLegend={false}
            />
          </div>
          {insights && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-2 gap-3 mt-4"
            >
              <div className="px-3 py-2.5 rounded-lg bg-app-teal/10 border border-app-teal/25 flex items-start gap-2.5">
                <TrendingUp className="w-4 h-4 text-app-teal mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-text-quaternary font-semibold">
                    Peak {viewLabel(view, 'singular')}
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                    <span className="text-app-teal">{peakName}</span>
                    <span className="text-text-tertiary text-xs font-normal">
                      {' '}· {formatCurrencyShort(insights.peakAmount)}
                      {insights.peakDelta > 0.05 && (
                        <> ({(insights.peakDelta * 100).toFixed(0)}% above avg)</>
                      )}
                    </span>
                  </p>
                </div>
              </div>
              <div className="px-3 py-2.5 rounded-lg bg-[var(--overlay-2)] border border-border">
                <p className="text-[10px] uppercase tracking-widest text-text-quaternary font-semibold">
                  Quietest {viewLabel(view, 'singular')}
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                  {insights.dipName}
                </p>
              </div>
            </motion.div>
          )}
        </>
      ) : (
        <ChartEmptyState height={260} message="No expense data available" />
      )}
    </motion.div>
  )
}

function viewLabel(view: ViewMode, form: 'singular' | 'plural'): string {
  if (view === 'day-of-week') return form === 'singular' ? 'Day' : 'Days'
  if (view === 'day-of-month') return form === 'singular' ? 'Date' : 'Dates'
  return form === 'singular' ? 'Month' : 'Months'
}

function viewAriaLabel(view: ViewMode): string {
  if (view === 'day-of-week') return 'Bar chart of average spending by day of the week'
  if (view === 'day-of-month') return 'Bar chart of average spending by day of the month'
  return 'Bar chart of average spending by month of the year'
}
