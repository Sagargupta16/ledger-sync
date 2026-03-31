import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate, BAR_RADIUS } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type ViewMode = 'day-of-week' | 'day-of-month' | 'monthly'

export default function CohortSpendingAnalysis() {
  const { data: transactions = [] } = useTransactions()
  const [view, setView] = useState<ViewMode>('day-of-week')

  const expenses = useMemo(
    () => transactions.filter((t) => t.type === 'Expense'),
    [transactions],
  )

  // Day-of-week averages
  const dowData = useMemo(() => {
    const totals = new Array(7).fill(0)
    const counts = new Array(7).fill(0)
    const weeks = new Set<string>()
    for (const tx of expenses) {
      const d = new Date(tx.date)
      totals[d.getDay()] += Math.abs(tx.amount)
      counts[d.getDay()]++
      weeks.add(`${d.getFullYear()}-W${Math.ceil((d.getDate() + d.getDay()) / 7)}`)
    }
    const weekCount = Math.max(1, weeks.size)
    return DAY_NAMES.map((name, i) => ({
      name,
      avg: Math.round(totals[i] / weekCount),
      count: counts[i],
    }))
  }, [expenses])

  // Day-of-month averages (1-31)
  const domData = useMemo(() => {
    const totals: Record<number, number> = {}
    const months = new Set<string>()
    for (const tx of expenses) {
      const d = new Date(tx.date)
      const day = d.getDate()
      totals[day] = (totals[day] || 0) + Math.abs(tx.amount)
      months.add(tx.date.substring(0, 7))
    }
    const monthCount = Math.max(1, months.size)
    return Array.from({ length: 31 }, (_, i) => ({
      name: String(i + 1),
      avg: Math.round((totals[i + 1] || 0) / monthCount),
    }))
  }, [expenses])

  // Monthly seasonal averages (Jan-Dec)
  const monthlyData = useMemo(() => {
    const totals = new Array(12).fill(0)
    const yearSet = new Set<number>()
    for (const tx of expenses) {
      const d = new Date(tx.date)
      totals[d.getMonth()] += Math.abs(tx.amount)
      yearSet.add(d.getFullYear())
    }
    const yearCount = Math.max(1, yearSet.size)
    return MONTH_NAMES.map((name, i) => ({
      name,
      avg: Math.round(totals[i] / yearCount),
    }))
  }, [expenses])

  const dataByView: Record<ViewMode, Array<{ name: string; avg: number }>> = {
    'day-of-week': dowData,
    'day-of-month': domData,
    'monthly': monthlyData,
  }
  const currentData = dataByView[view]
  const hasData = expenses.length > 0

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-ios-teal" />
          <h3 className="text-lg font-semibold text-white">Spending Patterns</h3>
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
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${view === key ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
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

      {!hasData ? (
        <ChartEmptyState height={260} message="No expense data available" />
      ) : (
        <ChartContainer height={260}>
          <BarChart data={currentData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis {...xAxisDefaults(currentData.length)} dataKey="name" tickFormatter={undefined} />
            <YAxis {...yAxisDefaults()} />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
            />
            <Bar
              dataKey="avg"
              name="Avg Spending"
              fill={rawColors.ios.teal}
              fillOpacity={0.7}
              radius={BAR_RADIUS}
              maxBarSize={view === 'day-of-month' ? 14 : 30}
              animationDuration={600}
              animationEasing="ease-out"
              isAnimationActive={shouldAnimate(currentData.length)}
            />
          </BarChart>
        </ChartContainer>
      )}
    </motion.div>
  )
}
