import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp, TrendingDown, Equal, Upload, Lightbulb } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import {
  getCurrentYear,
  getCurrentFY,
  getFYDateRange,
  getDateKey,
  getAvailableFYs,
} from '@/lib/dateUtils'
import { rawColors } from '@/constants/colors'
import EmptyState from '@/components/shared/EmptyState'
import {
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { CHART_COLORS } from '@/constants/chartColors'

// ─── Types ──────────────────────────────────────────────────────────
type CompareMode = 'month' | 'year' | 'fy'

interface PeriodSummary {
  label: string
  income: number
  expense: number
  savings: number
  savingsRate: number
  transactions: number
  categories: Record<string, { income: number; expense: number }>
}

interface CategoryDelta {
  category: string
  periodA: number
  periodB: number
  change: number
  changeAbs: number
  type: 'income' | 'expense'
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Return the appropriate arrow icon for a change value */
function ChangeIcon({ change, size = 'w-3.5 h-3.5' }: Readonly<{ change: number; size?: string }>) {
  if (Math.abs(change) < 1) return <Minus className={`${size} text-muted-foreground`} />
  if (change > 0) return <ArrowUpRight className={size} />
  return <ArrowDownRight className={size} />
}

/** Return Tailwind class for the change badge background + text */
function changeBadgeClass(change: number, isGood: boolean): string {
  if (Math.abs(change) < 1) return 'text-muted-foreground bg-white/5'
  if (isGood) return 'text-ios-green bg-ios-green/10'
  return 'text-ios-red bg-ios-red/10'
}

const pctChange = (curr: number, prev: number): number => {
  if (prev === 0) return curr === 0 ? 0 : 100
  return ((curr - prev) / Math.abs(prev)) * 100
}

const getMonthOptions = (transactions: Array<{ date: string }>) => {
  const months = new Set<string>()
  for (const tx of transactions) months.add(tx.date.substring(0, 7))
  return Array.from(months).sort((a, b) => b.localeCompare(a))
}

const getYearOptions = (transactions: Array<{ date: string }>) => {
  const years = new Set<number>()
  for (const tx of transactions) years.add(Number.parseInt(tx.date.substring(0, 4)))
  return Array.from(years).sort((a, b) => b - a)
}

const formatMonthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ─── Insight generators (extracted to reduce component complexity) ──

function generateIncomeInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const incChange = pctChange(periodB.income, periodA.income)
  if (Math.abs(incChange) < 5) return null
  return incChange > 0
    ? `Income grew by ${formatPercent(Math.abs(incChange))} from ${periodA.label} to ${periodB.label}.`
    : `Income dropped by ${formatPercent(Math.abs(incChange))} from ${periodA.label} to ${periodB.label}.`
}

function generateExpenseInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const expChange = pctChange(periodB.expense, periodA.expense)
  if (Math.abs(expChange) < 5) return null
  return expChange > 0
    ? `Spending increased by ${formatPercent(Math.abs(expChange))}. Review discretionary categories.`
    : `Spending decreased by ${formatPercent(Math.abs(expChange))} — good cost control.`
}

function generateSavingsRateInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const rateShift = periodB.savingsRate - periodA.savingsRate
  if (Math.abs(rateShift) < 3) return null
  return rateShift > 0
    ? `Savings rate improved by ${rateShift.toFixed(1)} percentage points.`
    : `Savings rate declined by ${Math.abs(rateShift).toFixed(1)} percentage points.`
}

function generateCategorySwingInsight(expenseDeltas: CategoryDelta[]): string | null {
  if (expenseDeltas.length === 0) return null
  const biggest = expenseDeltas[0]
  if (Math.abs(biggest.changeAbs) === 0) return null
  const direction = biggest.changeAbs > 0 ? 'increased' : 'decreased'
  return `"${biggest.category}" ${direction} the most: ${formatCurrency(Math.abs(biggest.changeAbs))} (${biggest.change > 0 ? '+' : ''}${biggest.change.toFixed(1)}%).`
}

function generateNewCategoriesInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const newCats = Object.keys(periodB.categories).filter(
    (c) => !periodA.categories[c] && (periodB.categories[c].expense > 0 || periodB.categories[c].income > 0)
  )
  if (newCats.length === 0) return null
  return `${newCats.length} new categor${newCats.length === 1 ? 'y' : 'ies'} appeared in ${periodB.label}: ${newCats.slice(0, 3).join(', ')}${newCats.length > 3 ? '…' : ''}.`
}

function generateGoneCategoriesInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const goneCats = Object.keys(periodA.categories).filter(
    (c) => !periodB.categories[c] && (periodA.categories[c].expense > 0 || periodA.categories[c].income > 0)
  )
  if (goneCats.length === 0) return null
  return `${goneCats.length} categor${goneCats.length === 1 ? 'y' : 'ies'} no longer active in ${periodB.label}: ${goneCats.slice(0, 3).join(', ')}${goneCats.length > 3 ? '…' : ''}.`
}

function generateTxVolumeInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const txChange = pctChange(periodB.transactions, periodA.transactions)
  if (Math.abs(txChange) < 15) return null
  return txChange > 0
    ? `Transaction volume surged ${formatPercent(Math.abs(txChange))} — more frequent activity.`
    : `Transaction count fell ${formatPercent(Math.abs(txChange))} — fewer transactions recorded.`
}

function generateAllInsights(periodA: PeriodSummary, periodB: PeriodSummary, expenseDeltas: CategoryDelta[]): string[] {
  const generators = [
    () => generateIncomeInsight(periodA, periodB),
    () => generateExpenseInsight(periodA, periodB),
    () => generateSavingsRateInsight(periodA, periodB),
    () => generateCategorySwingInsight(expenseDeltas),
    () => generateNewCategoriesInsight(periodA, periodB),
    () => generateGoneCategoriesInsight(periodA, periodB),
    () => generateTxVolumeInsight(periodA, periodB),
  ]
  return generators.map(gen => gen()).filter((s): s is string => s !== null)
}

// ─── Component ──────────────────────────────────────────────────────
export default function ComparisonPage() {
  const { data: transactions = [], isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // ─── Mode & selection state ───────────────────────────────────
  const [mode, setMode] = useState<CompareMode>('month')

  // Month selectors — default to most recent 2 complete months
  const monthOptions = useMemo(() => getMonthOptions(transactions), [transactions])
  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])
  // Default: skip current month, pick last 2 complete months
  const defaultMonths = useMemo(() => {
    const complete = monthOptions.filter((m) => m < currentMonthKey)
    return { a: complete[1] || monthOptions[1] || '', b: complete[0] || monthOptions[0] || '' }
  }, [monthOptions, currentMonthKey])
  const [monthA, setMonthA] = useState('')
  const [monthB, setMonthB] = useState('')
  const effectiveMonthA = monthA || defaultMonths.a
  const effectiveMonthB = monthB || defaultMonths.b

  // Year selectors
  const yearOptions = useMemo(() => getYearOptions(transactions), [transactions])
  const [yearA, setYearA] = useState(() => getCurrentYear() - 1)
  const [yearB, setYearB] = useState(() => getCurrentYear())

  // FY selectors
  const fyOptions = useMemo(
    () => getAvailableFYs(transactions, fiscalYearStartMonth),
    [transactions, fiscalYearStartMonth]
  )
  const [fyA, setFyA] = useState(() => {
    const curr = getCurrentFY(fiscalYearStartMonth)
    const idx = fyOptions.indexOf(curr)
    return fyOptions[idx + 1] || fyOptions.at(-1) || curr
  })
  const [fyB, setFyB] = useState(() => getCurrentFY(fiscalYearStartMonth))

  // ─── Build period summaries ───────────────────────────────────
  const buildSummary = useMemo(() => {
    return (
      label: string,
      startDate: string,
      endDate: string
    ): PeriodSummary => {
    const cats: Record<string, { income: number; expense: number }> = {}
    let income = 0
    let expense = 0
    let count = 0

    for (const tx of transactions) {
      const d = getDateKey(tx.date)
      if (d < startDate || d > endDate) continue
      count++
      const cat = tx.category || 'Uncategorized'
      if (!cats[cat]) cats[cat] = { income: 0, expense: 0 }
      if (tx.type === 'Income') {
        income += Math.abs(tx.amount)
        cats[cat].income += Math.abs(tx.amount)
      } else if (tx.type === 'Expense') {
        expense += Math.abs(tx.amount)
        cats[cat].expense += Math.abs(tx.amount)
      }
    }

    const savings = income - expense
    return {
      label,
      income,
      expense,
      savings,
      savingsRate: income > 0 ? (savings / income) * 100 : 0,
      transactions: count,
      categories: cats,
    }
  }
  }, [transactions])

  const [periodA, periodB] = useMemo((): [PeriodSummary, PeriodSummary] => {
    if (transactions.length === 0) {
      const empty: PeriodSummary = { label: '-', income: 0, expense: 0, savings: 0, savingsRate: 0, transactions: 0, categories: {} }
      return [empty, empty]
    }

    if (mode === 'month') {
      const aStart = `${effectiveMonthA}-01`
      const [ay, am] = effectiveMonthA.split('-').map(Number)
      const aEnd = `${effectiveMonthA}-${new Date(ay, am, 0).getDate()}`
      const bStart = `${effectiveMonthB}-01`
      const [by, bm] = effectiveMonthB.split('-').map(Number)
      const bEnd = `${effectiveMonthB}-${new Date(by, bm, 0).getDate()}`
      return [
        buildSummary(formatMonthLabel(effectiveMonthA), aStart, aEnd),
        buildSummary(formatMonthLabel(effectiveMonthB), bStart, bEnd),
      ]
    }

    if (mode === 'year') {
      return [
        buildSummary(String(yearA), `${yearA}-01-01`, `${yearA}-12-31`),
        buildSummary(String(yearB), `${yearB}-01-01`, `${yearB}-12-31`),
      ]
    }

    // FY
    const rangeA = getFYDateRange(fyA, fiscalYearStartMonth)
    const rangeB = getFYDateRange(fyB, fiscalYearStartMonth)
    return [
      buildSummary(fyA, rangeA.start, rangeA.end),
      buildSummary(fyB, rangeB.start, rangeB.end),
    ]
  }, [transactions, buildSummary, mode, effectiveMonthA, effectiveMonthB, yearA, yearB, fyA, fyB, fiscalYearStartMonth])

  // ─── Category deltas ──────────────────────────────────────────
  const categoryDeltas = useMemo((): CategoryDelta[] => {
    const allCats = new Set([...Object.keys(periodA.categories), ...Object.keys(periodB.categories)])
    const deltas: CategoryDelta[] = []

    for (const cat of allCats) {
      const a = periodA.categories[cat] || { income: 0, expense: 0 }
      const b = periodB.categories[cat] || { income: 0, expense: 0 }

      if (a.expense > 0 || b.expense > 0) {
        deltas.push({
          category: cat,
          periodA: a.expense,
          periodB: b.expense,
          change: pctChange(b.expense, a.expense),
          changeAbs: b.expense - a.expense,
          type: 'expense',
        })
      }
      if (a.income > 0 || b.income > 0) {
        deltas.push({
          category: cat,
          periodA: a.income,
          periodB: b.income,
          change: pctChange(b.income, a.income),
          changeAbs: b.income - a.income,
          type: 'income',
        })
      }
    }

    return deltas.sort((x, y) => Math.max(y.periodA, y.periodB) - Math.max(x.periodA, x.periodB))
  }, [periodA, periodB])

  const expenseDeltas = categoryDeltas.filter((d) => d.type === 'expense')
  const incomeDeltas = categoryDeltas.filter((d) => d.type === 'income')

  // ─── Spending distribution donut data ────────────────────────────
  const distributionA = useMemo(() => {
    return Object.entries(periodA.categories)
      .map(([cat, data]) => ({ name: cat, value: data.expense }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [periodA])

  const distributionB = useMemo(() => {
    return Object.entries(periodB.categories)
      .map(([cat, data]) => ({ name: cat, value: data.expense }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [periodB])

  // ─── Auto-generated insights ─────────────────────────────────────
  const insights = useMemo(
    () => generateAllInsights(periodA, periodB, expenseDeltas),
    [periodA, periodB, expenseDeltas]
  )

  // ─── Render ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-10 w-72 bg-white/5 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {['income', 'expenses', 'savings', 'rate'].map((name) => (
            <div key={`skel-${name}`} className="h-48 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          title="No transactions yet"
          description="Upload your Excel data to start comparing periods."
          icon={Upload}
        />
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <PageHeader
        title="Period Comparison"
        subtitle="Compare financial metrics across time periods"
        action={
          <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
            {([['month', 'Month'], ['year', 'Year'], ['fy', 'FY']] as const).map(([val, label]) => (
              <motion.button
                key={val}
                role="tab"
                aria-selected={mode === val}
                onClick={() => setMode(val)}
                className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === val ? 'text-white' : 'text-muted-foreground hover:text-white hover:bg-white/10'
                }`}
                whileTap={{ scale: 0.97 }}
              >
                {mode === val && (
                  <motion.div
                    layoutId="comparisonModeTab"
                    className="absolute inset-0 rounded-lg"
                    style={{ backgroundColor: rawColors.ios.indigo }}
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </motion.button>
            ))}
          </div>
        }
      />

      {/* Period Selectors */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-5"
      >
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
          <PeriodSelector
            mode={mode}
            label="Period A"
            monthOptions={monthOptions}
            yearOptions={yearOptions}
            fyOptions={fyOptions}
            month={effectiveMonthA}
            year={yearA}
            fy={fyA}
            onMonth={setMonthA}
            onYear={setYearA}
            onFy={setFyA}
          />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Equal className="w-5 h-5" />
            <span className="text-sm font-medium">vs</span>
          </div>
          <PeriodSelector
            mode={mode}
            label="Period B"
            monthOptions={monthOptions}
            yearOptions={yearOptions}
            fyOptions={fyOptions}
            month={effectiveMonthB}
            year={yearB}
            fy={fyB}
            onMonth={setMonthB}
            onYear={setYearB}
            onFy={setFyB}
          />
        </div>
      </motion.div>

      {/* KPI Overview */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${periodA.label}-${periodB.label}`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          <KpiCard
            title="Income"
            valueA={periodA.income}
            valueB={periodB.income}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.green}
          />
          <KpiCard
            title="Expenses"
            valueA={periodA.expense}
            valueB={periodB.expense}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.red}
            invertChange
          />
          <KpiCard
            title="Savings"
            valueA={periodA.savings}
            valueB={periodB.savings}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.blue}
          />
          <KpiCard
            title="Savings Rate"
            valueA={periodA.savingsRate}
            valueB={periodB.savingsRate}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.purple}
            isPercent
          />
        </motion.div>
      </AnimatePresence>

      {/* Visual Overview — stacked comparison bars */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl border border-border p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold mb-6">Financial Overview</h2>
        <div className="space-y-6">
          {/* Income comparison */}
          <OverviewMetricRow
            label="Income"
            valueA={periodA.income}
            valueB={periodB.income}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.green}
            maxValue={Math.max(periodA.income, periodB.income, periodA.expense, periodB.expense, 1)}
          />
          {/* Expense comparison */}
          <OverviewMetricRow
            label="Expenses"
            valueA={periodA.expense}
            valueB={periodB.expense}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.red}
            maxValue={Math.max(periodA.income, periodB.income, periodA.expense, periodB.expense, 1)}
            invertChange
          />
          {/* Savings comparison */}
          <OverviewMetricRow
            label="Savings"
            valueA={periodA.savings}
            valueB={periodB.savings}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.blue}
            maxValue={Math.max(periodA.income, periodB.income, periodA.expense, periodB.expense, 1)}
          />
          {/* Savings rate */}
          <OverviewMetricRow
            label="Savings Rate"
            valueA={periodA.savingsRate}
            valueB={periodB.savingsRate}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.purple}
            maxValue={100}
            isPercent
          />
        </div>
      </motion.div>

      {/* Spending Distribution — Side-by-side donuts */}
      {(distributionA.length > 0 || distributionB.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-2xl border border-border p-6 shadow-xl"
        >
          <h2 className="text-lg font-semibold mb-1">Spending Distribution</h2>
          <p className="text-xs text-text-tertiary mb-4">How spending is spread across categories</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Period A donut */}
            <div>
              <p className="text-sm font-medium text-center mb-2" style={{ color: rawColors.ios.blue }}>{periodA.label}</p>
              {distributionA.length > 0 ? (
                <div className="flex flex-col items-center">
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie
                          data={distributionA}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          dataKey="value"
                          stroke="none"
                        >
                          {distributionA.map((entry, i) => (
                            <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          {...chartTooltipProps}
                          formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(value)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
                    {distributionA.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs text-muted-foreground truncate max-w-24">{d.name}</span>
                        <span className="text-xs text-text-tertiary">{periodA.expense > 0 ? ((d.value / periodA.expense) * 100).toFixed(0) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No expense data</p>
              )}
            </div>

            {/* Period B donut */}
            <div>
              <p className="text-sm font-medium text-center mb-2" style={{ color: rawColors.ios.indigo }}>{periodB.label}</p>
              {distributionB.length > 0 ? (
                <div className="flex flex-col items-center">
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie
                          data={distributionB}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          dataKey="value"
                          stroke="none"
                        >
                          {distributionB.map((entry, i) => (
                            <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          {...chartTooltipProps}
                          formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(value)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
                    {distributionB.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs text-muted-foreground truncate max-w-24">{d.name}</span>
                        <span className="text-xs text-text-tertiary">{periodB.expense > 0 ? ((d.value / periodB.expense) * 100).toFixed(0) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No expense data</p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Category Breakdown — Visual Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Categories */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl border border-border p-6 shadow-xl"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-ios-red" />
              <h2 className="text-lg font-semibold">Expense Categories</h2>
            </div>
            <span className="text-xs text-text-tertiary">{expenseDeltas.length} categories</span>
          </div>
          {expenseDeltas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expense data for selected periods.</p>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {expenseDeltas.map((d, i) => (
                <CategoryDeltaRow
                  key={d.category}
                  delta={d}
                  labelA={periodA.label}
                  labelB={periodB.label}
                  maxValue={Math.max(expenseDeltas[0].periodA, expenseDeltas[0].periodB, 1)}
                  colorA={rawColors.ios.blue}
                  colorB={rawColors.ios.indigo}
                  invertChange
                  index={i}
                />
              ))}
            </div>
          )}
        </motion.div>

        {/* Income Categories */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl border border-border p-6 shadow-xl"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-ios-green" />
              <h2 className="text-lg font-semibold">Income Categories</h2>
            </div>
            <span className="text-xs text-text-tertiary">{incomeDeltas.length} categories</span>
          </div>
          {incomeDeltas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No income data for selected periods.</p>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {incomeDeltas.map((d, i) => (
                <CategoryDeltaRow
                  key={d.category}
                  delta={d}
                  labelA={periodA.label}
                  labelB={periodB.label}
                  maxValue={Math.max(incomeDeltas[0].periodA, incomeDeltas[0].periodB, 1)}
                  colorA={rawColors.ios.blue}
                  colorB={rawColors.ios.indigo}
                  index={i}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Transaction Count & Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="glass rounded-2xl border border-border p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold mb-4">Quick Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickStat label="Transactions" valueA={periodA.transactions} valueB={periodB.transactions} labelA={periodA.label} labelB={periodB.label} />
          <QuickStat label="Avg Daily Spend" valueA={periodA.expense / 30} valueB={periodB.expense / 30} labelA={periodA.label} labelB={periodB.label} isCurrency />
          <QuickStat label="Categories Used" valueA={Object.keys(periodA.categories).length} valueB={Object.keys(periodB.categories).length} labelA={periodA.label} labelB={periodB.label} />
          <QuickStat
            label="Top Expense"
            valueA={
              Math.max(...Object.values(periodA.categories).map((c) => c.expense), 0)
            }
            valueB={
              Math.max(...Object.values(periodB.categories).map((c) => c.expense), 0)
            }
            labelA={periodA.label}
            labelB={periodB.label}
            isCurrency
          />
        </div>
      </motion.div>

      {/* Auto-generated Insights */}
      {insights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass rounded-2xl border border-border p-6 shadow-xl"
        >
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-ios-orange" />
            <h2 className="text-lg font-semibold">Key Insights</h2>
          </div>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <motion.div
                key={insight}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.05 }}
                className="flex items-start gap-3 p-3 rounded-xl bg-white/5"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-ios-orange mt-1.5 shrink-0" />
                <p className="text-sm text-foreground">{insight}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Sub components ─────────────────────────────────────────────────

function PeriodSelector({
  mode,
  label,
  monthOptions,
  yearOptions,
  fyOptions,
  month,
  year,
  fy,
  onMonth,
  onYear,
  onFy,
}: Readonly<{
  mode: CompareMode
  label: string
  monthOptions: string[]
  yearOptions: number[]
  fyOptions: string[]
  month: string
  year: number
  fy: string
  onMonth: (m: string) => void
  onYear: (y: number) => void
  onFy: (f: string) => void
}>) {
  const selectClass =
    'px-3 py-2 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-border text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors'

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      {mode === 'month' && (
        <select className={selectClass} value={month} onChange={(e) => onMonth(e.target.value)}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
      )}
      {mode === 'year' && (
        <select className={selectClass} value={year} onChange={(e) => onYear(Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      {mode === 'fy' && (
        <select className={selectClass} value={fy} onChange={(e) => onFy(e.target.value)}>
          {fyOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function KpiCard({
  title,
  valueA,
  valueB,
  labelA,
  color,
  invertChange,
  isPercent,
}: Readonly<{
  title: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  color: string
  invertChange?: boolean
  isPercent?: boolean
}>) {
  const change = isPercent ? valueB - valueA : pctChange(valueB, valueA)
  const isPositive = change >= 0
  const isGood = invertChange ? !isPositive : isPositive
  const fmtVal = (v: number) => (isPercent ? `${v.toFixed(1)}%` : formatCurrency(v))

  const changeIndicator = (() => {
    if (Math.abs(change) < 1) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />
    if (isPositive) return <ArrowUpRight className="w-3.5 h-3.5" />
    return <ArrowDownRight className="w-3.5 h-3.5" />
  })()

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-5 shadow-xl"
      whileHover={{ scale: 1.01 }}
    >
      <p className="text-sm text-muted-foreground mb-1">{title}</p>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold" style={{ color }}>{fmtVal(valueB)}</span>
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        <span className="opacity-60">{labelA}:</span> {fmtVal(valueA)}
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium ${isGood ? 'text-ios-green' : 'text-ios-red'}`}>
        {changeIndicator}
        <span>
          {change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}
        </span>
      </div>
    </motion.div>
  )
}

function OverviewMetricRow({
  label,
  valueA,
  valueB,
  labelA,
  labelB,
  color,
  maxValue,
  invertChange,
  isPercent,
}: Readonly<{
  label: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  color: string
  maxValue: number
  invertChange?: boolean
  isPercent?: boolean
}>) {
  const change = isPercent ? valueB - valueA : pctChange(valueB, valueA)
  const isPositive = change >= 0
  const isGood = invertChange ? !isPositive : isPositive
  const fmtVal = (v: number) => (isPercent ? `${v.toFixed(1)}%` : formatCurrency(v))

  const barWidthA = maxValue > 0 ? (Math.abs(valueA) / maxValue) * 100 : 0
  const barWidthB = maxValue > 0 ? (Math.abs(valueB) / maxValue) * 100 : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{label}</span>
        <div className={`flex items-center gap-1 text-xs font-medium ${isGood ? 'text-ios-green' : 'text-ios-red'}`}>
          <ChangeIcon change={change} size="w-3 h-3" />
          <span>{change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}</span>
        </div>
      </div>
      {/* Period A bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-24 truncate">{labelA}</span>
        <div className="flex-1 h-5 rounded-md bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-md"
            style={{ backgroundColor: color, opacity: 0.6 }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidthA}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <span className="text-xs font-medium text-foreground tabular-nums w-24 text-right">{fmtVal(valueA)}</span>
      </div>
      {/* Period B bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-24 truncate">{labelB}</span>
        <div className="flex-1 h-5 rounded-md bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-md"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidthB}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          />
        </div>
        <span className="text-xs font-medium text-white tabular-nums w-24 text-right">{fmtVal(valueB)}</span>
      </div>
    </div>
  )
}

function CategoryDeltaRow({
  delta,
  labelA,
  labelB,
  maxValue,
  colorA,
  colorB,
  invertChange,
  index,
}: Readonly<{
  delta: CategoryDelta
  labelA: string
  labelB: string
  maxValue: number
  colorA: string
  colorB: string
  invertChange?: boolean
  index: number
}>) {
  const { category, periodA, periodB, change } = delta
  const isPositive = change >= 0
  const isGood = invertChange ? !isPositive : isPositive

  const widthA = maxValue > 0 ? (periodA / maxValue) * 100 : 0
  const widthB = maxValue > 0 ? (periodB / maxValue) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
    >
      {/* Header: category name + change badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white truncate flex-1">{category}</span>
        <span className={`flex items-center gap-1 text-xs font-semibold ml-2 px-2 py-0.5 rounded-full ${changeBadgeClass(change, isGood)}`}>
          <ChangeIcon change={change} size="w-3 h-3" />
          {change > 0 ? '+' : ''}{change.toFixed(1)}%
        </span>
      </div>

      {/* Period A bar */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-caption text-text-tertiary w-16 truncate">{labelA}</span>
        <div className="flex-1 h-3 rounded bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded"
            style={{ backgroundColor: colorA, opacity: 0.65 }}
            initial={{ width: 0 }}
            animate={{ width: `${widthA}%` }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: index * 0.03 }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">{formatCurrency(periodA)}</span>
      </div>

      {/* Period B bar */}
      <div className="flex items-center gap-2">
        <span className="text-caption text-text-tertiary w-16 truncate">{labelB}</span>
        <div className="flex-1 h-3 rounded bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded"
            style={{ backgroundColor: colorB }}
            initial={{ width: 0 }}
            animate={{ width: `${widthB}%` }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: index * 0.03 + 0.08 }}
          />
        </div>
        <span className="text-xs font-medium text-white tabular-nums w-20 text-right">{formatCurrency(periodB)}</span>
      </div>
    </motion.div>
  )
}

function QuickStat({
  label,
  valueA,
  valueB,
  labelA,
  labelB,
  isCurrency,
}: Readonly<{
  label: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  isCurrency?: boolean
}>) {
  const fmt = (v: number) => (isCurrency ? formatCurrencyShort(v) : String(Math.round(v)))

  return (
    <div className="p-4 rounded-xl bg-white/5">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{labelA}</p>
          <p className="text-base font-semibold">{fmt(valueA)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">{labelB}</p>
          <p className="text-base font-semibold">{fmt(valueB)}</p>
        </div>
      </div>
    </div>
  )
}
