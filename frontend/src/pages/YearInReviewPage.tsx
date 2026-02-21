import { motion } from 'framer-motion'
import { CHART_AXIS_COLOR } from '@/constants/chartColors'
import {
  Flame,
  TrendingDown,
  TrendingUp,
  Sun,
  Moon,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { getSmartInterval } from '@/lib/chartUtils'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { formatCurrency, formatCurrencyCompact, formatCurrencyShort } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getCurrentYear, getCurrentMonth, getCurrentFY, type AnalyticsViewMode } from '@/lib/dateUtils'
import { usePreferencesStore } from '@/store/preferencesStore'
import StatCard from '@/pages/year-in-review/StatCard'
import InsightRow from '@/pages/year-in-review/InsightRow'
import DayOfWeekChart, { type DayCell } from '@/pages/year-in-review/DayOfWeekChart'

// ─── Types ──────────────────────────────────────────────────────────
type HeatmapMode = 'expense' | 'income' | 'net'

// ─── Helpers ────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getIntensityLevel(value: number, max: number): number {
  if (value === 0 || max === 0) return 0
  const ratio = value / max
  if (ratio < 0.15) return 1
  if (ratio < 0.35) return 2
  if (ratio < 0.6) return 3
  return 4
}

const heatmapColors: Record<HeatmapMode, string[]> = {
  expense: [
    'rgba(255,255,255,0.04)',   // 0 – empty
    'rgba(239,68,68,0.20)',     // 1 – light
    'rgba(239,68,68,0.40)',     // 2
    'rgba(239,68,68,0.65)',     // 3
    'rgba(239,68,68,0.90)',     // 4 – intense
  ],
  income: [
    'rgba(255,255,255,0.04)',
    'rgba(34,197,94,0.20)',
    'rgba(34,197,94,0.40)',
    'rgba(34,197,94,0.65)',
    'rgba(34,197,94,0.90)',
  ],
  net: [
    'rgba(255,255,255,0.04)',
    'rgba(59,130,246,0.20)',
    'rgba(59,130,246,0.40)',
    'rgba(59,130,246,0.65)',
    'rgba(59,130,246,0.90)',
  ],
}

const modeAccent: Record<HeatmapMode, string> = {
  expense: rawColors.ios.red,
  income: rawColors.ios.green,
  net: rawColors.ios.blue,
}

/** Get monthly value for a given mode */
function getMonthlyValue(
  mode: HeatmapMode,
  monthlyExpense: number[],
  monthlyIncome: number[],
  index: number,
): number {
  if (mode === 'expense') return monthlyExpense[index]
  if (mode === 'income') return monthlyIncome[index]
  return monthlyIncome[index] - monthlyExpense[index]
}

/** Get max monthly value for a given mode (used for intensity scaling) */
function getMonthlyMax(
  mode: HeatmapMode,
  monthlyExpense: number[],
  monthlyIncome: number[],
): number {
  if (mode === 'expense') return Math.max(...monthlyExpense)
  if (mode === 'income') return Math.max(...monthlyIncome)
  return Math.max(...monthlyIncome.map((inc, idx) => Math.abs(inc - monthlyExpense[idx])))
}

/** Get streak color based on streak length */
function getStreakColor(maxStreak: number): string {
  if (maxStreak >= 14) return rawColors.ios.purple
  if (maxStreak >= 7) return rawColors.ios.blue
  return rawColors.ios.green
}

// ─── Extracted helpers (outside component to avoid cognitive complexity) ──

/** Aggregate per-day expense/income totals from transactions within a date range. */
function aggregateDayTotals(
  transactions: { date: string; type: string; amount: number }[],
  startStr: string,
  endStr: string,
) {
  const dayExpenses: Record<string, number> = {}
  const dayIncomes: Record<string, number> = {}

  for (const tx of transactions) {
    const d = tx.date.substring(0, 10)
    if (d < startStr || d > endStr) continue

    if (tx.type === 'Expense') {
      dayExpenses[d] = (dayExpenses[d] || 0) + Math.abs(tx.amount)
    } else if (tx.type === 'Income') {
      dayIncomes[d] = (dayIncomes[d] || 0) + Math.abs(tx.amount)
    }
  }
  return { dayExpenses, dayIncomes }
}

/** Walk from startDate to endDate, producing one DayCell per day plus running maxes. */
function buildDayCells(
  startDate: Date,
  endDate: Date,
  dayExpenses: Record<string, number>,
  dayIncomes: Record<string, number>,
) {
  const todayStr = new Date().toISOString().substring(0, 10)
  const startDow = startDate.getDay()
  const cells: DayCell[] = []
  let mxE = 0
  let mxI = 0
  let mxN = 0

  const current = new Date(startDate)
  while (current <= endDate) {
    const dateStr = current.toISOString().substring(0, 10)
    const dayOffset = Math.floor((current.getTime() - startDate.getTime()) / 86400000)
    const weekIndex = Math.floor((dayOffset + startDow) / 7)
    const exp = dayExpenses[dateStr] || 0
    const inc = dayIncomes[dateStr] || 0
    const net = inc - exp

    if (exp > mxE) mxE = exp
    if (inc > mxI) mxI = inc
    const absNet = Math.abs(net)
    if (absNet > mxN) mxN = absNet

    cells.push({
      date: dateStr,
      expense: exp,
      income: inc,
      net,
      dayOfWeek: current.getDay(),
      weekIndex,
      month: current.getMonth(),
      isToday: dateStr === todayStr,
      hasTx: exp > 0 || inc > 0,
    })
    current.setDate(current.getDate() + 1)
  }
  return { cells, mxE, mxI, mxN }
}

/** Derive month labels positioned at their first Sunday occurrence. */
function deriveMonthLabels(cells: DayCell[]) {
  const labels: { month: string; weekIndex: number }[] = []
  let prevMonth = -1
  for (const cell of cells) {
    if (cell.month !== prevMonth && cell.dayOfWeek === 0) {
      labels.push({ month: MONTHS_SHORT[cell.month], weekIndex: cell.weekIndex })
      prevMonth = cell.month
    }
  }
  const firstMonth = cells.length > 0 ? MONTHS_SHORT[cells[0].month] : 'Jan'
  if (labels.length === 0 || labels[0].month !== firstMonth) {
    labels.unshift({ month: firstMonth, weekIndex: 0 })
  }
  return labels
}

/** Accumulate summary statistics from grid cells. */
function accumulateStats(grid: DayCell[]) {
  let totalExpense = 0
  let totalIncome = 0
  let daysWithExpense = 0
  let biggestExpenseDay = { date: '', amount: 0 }
  let biggestIncomeDay = { date: '', amount: 0 }
  let streak = 0
  let maxStreak = 0
  const monthlyExpense: number[] = Array.from({ length: 12 }, () => 0)
  const monthlyIncome: number[] = Array.from({ length: 12 }, () => 0)

  for (const cell of grid) {
    totalExpense += cell.expense
    totalIncome += cell.income
    monthlyExpense[cell.month] += cell.expense
    monthlyIncome[cell.month] += cell.income

    if (cell.expense > 0) {
      daysWithExpense++
      if (cell.expense > biggestExpenseDay.amount) {
        biggestExpenseDay = { date: cell.date, amount: cell.expense }
      }
    }
    if (cell.income > biggestIncomeDay.amount) {
      biggestIncomeDay = { date: cell.date, amount: cell.income }
    }

    if (cell.expense === 0 && cell.hasTx) {
      streak++
      if (streak > maxStreak) maxStreak = streak
    } else if (cell.expense > 0) {
      streak = 0
    }
  }

  return {
    totalExpense,
    totalIncome,
    daysWithExpense,
    biggestExpenseDay,
    biggestIncomeDay,
    maxStreak,
    monthlyExpense,
    monthlyIncome,
  }
}

/** Render a single heatmap cell */
function HeatmapCell({ cell, mode, modeMax }: Readonly<{ cell: DayCell; mode: HeatmapMode; modeMax: number }>) {
  const valMap = { expense: cell.expense, income: cell.income, net: Math.abs(cell.net) }
  const val = valMap[mode]
  const level = getIntensityLevel(val, modeMax)
  const bgColor = heatmapColors[mode][level]

  return (
    <div
      data-cell-date={cell.date}
      className="w-[13px] h-[13px] rounded-sm transition-[outline-color] duration-150 hover:ring-1 hover:ring-white/50"
      style={{
        backgroundColor: bgColor,
        outline: cell.isToday ? `2px solid ${modeAccent[mode]}` : undefined,
        outlineOffset: cell.isToday ? '-1px' : undefined,
      }}
    />
  )
}

/** Render the week columns of the heatmap grid */
function HeatmapWeeks({ grid, mode, modeMax }: Readonly<{ grid: DayCell[]; mode: HeatmapMode; modeMax: number }>) {
  const totalWeeks = grid.length > 0 ? (grid.at(-1)?.weekIndex ?? 52) + 1 : 53
  const weeks: React.ReactNode[] = []

  for (let w = 0; w < totalWeeks; w++) {
    const weekCells = grid.filter((c) => c.weekIndex === w)
    weeks.push(
      <div key={w} className="flex flex-col gap-0.5">
        {Array.from({ length: 7 }, (_, dow) => {
          const cell = weekCells.find((c) => c.dayOfWeek === dow)
          if (!cell) return <div key={dow} className="w-[13px] h-[13px]" />
          return <HeatmapCell key={dow} cell={cell} mode={mode} modeMax={modeMax} />
        })}
      </div>
    )
  }

  return <>{weeks}</>
}

// ─── Main Component ─────────────────────────────────────────────────
export default function YearInReviewPage() {
  const dims = useChartDimensions()
  const { data: transactions = [] } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const { displayPreferences } = usePreferencesStore()

  const [mode, setMode] = useState<HeatmapMode>('expense')
  const [hoveredDay, setHoveredDay] = useState<DayCell | null>(null)

  // Time filter state — only Yearly and FY modes for this page
  const prefMode = displayPreferences.defaultTimeRange as AnalyticsViewMode
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    prefMode === 'fy' ? 'fy' : 'yearly'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  const dataDateRange = useMemo(() => {
    if (transactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = transactions.map(t => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [transactions])

  // Derive the start year for the heatmap grid
  const selectedYear = useMemo(() => {
    if (viewMode === 'fy') {
      const match = /FY\s?(\d{4})-(\d{2})/.exec(currentFY)
      return match ? Number.parseInt(match[1]) : currentYear
    }
    return currentYear
  }, [viewMode, currentYear, currentFY])
  const isFYMode = viewMode === 'fy'

  // ── Build day grid (Jan–Dec for Yearly, Apr–Mar for FY) ─────
  const { grid, maxExpense, maxIncome, maxNet, monthLabels } = useMemo(() => {
    const startDate = isFYMode
      ? new Date(selectedYear, fiscalYearStartMonth - 1, 1)
      : new Date(selectedYear, 0, 1)
    const endDate = isFYMode
      ? new Date(selectedYear + 1, fiscalYearStartMonth - 1, 0)
      : new Date(selectedYear, 11, 31)

    const startStr = startDate.toISOString().substring(0, 10)
    const endStr = endDate.toISOString().substring(0, 10)

    const { dayExpenses, dayIncomes } = aggregateDayTotals(transactions, startStr, endStr)
    const { cells, mxE, mxI, mxN } = buildDayCells(startDate, endDate, dayExpenses, dayIncomes)
    const labels = deriveMonthLabels(cells)

    return { grid: cells, maxExpense: mxE, maxIncome: mxI, maxNet: mxN, monthLabels: labels }
  }, [transactions, selectedYear, isFYMode, fiscalYearStartMonth])

  // Resolve the correct max based on mode
  const modeMaxMap: Record<HeatmapMode, number> = { expense: maxExpense, income: maxIncome, net: maxNet }
  const modeMax = modeMaxMap[mode]

  // ── Summary statistics ───────────────────────────────────────
  const stats = useMemo(() => {
    const acc = accumulateStats(grid)
    const { totalExpense, totalIncome, daysWithExpense, monthlyExpense } = acc

    const bestMonth = monthlyExpense.indexOf(Math.min(...monthlyExpense.filter((e) => e > 0)))
    const worstMonth = monthlyExpense.indexOf(Math.max(...monthlyExpense))
    const dailyAvg = daysWithExpense > 0 ? totalExpense / daysWithExpense : 0

    return {
      ...acc,
      totalSavings: totalIncome - totalExpense,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0,
      dailyAvg,
      bestMonth: bestMonth >= 0 ? MONTHS_SHORT[bestMonth] : 'N/A',
      worstMonth: worstMonth >= 0 ? MONTHS_SHORT[worstMonth] : 'N/A',
    }
  }, [grid])

  // Monthly bar data
  const monthlyBarData = useMemo(() => {
    return MONTHS_SHORT.map((m, i) => ({
      name: m,
      Spending: stats.monthlyExpense[i],
      Earning: stats.monthlyIncome[i],
    }))
  }, [stats])

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <PageHeader
        title="Year in Review"
        subtitle="Your annual financial highlights and insights"
        action={
          <div className="flex items-center gap-3">
            <AnalyticsTimeFilter
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              currentYear={currentYear}
              currentMonth={currentMonth}
              currentFY={currentFY}
              onYearChange={setCurrentYear}
              onMonthChange={setCurrentMonth}
              onFYChange={setCurrentFY}
              minDate={dataDateRange.minDate}
              maxDate={dataDateRange.maxDate}
              fiscalYearStartMonth={fiscalYearStartMonth}
              availableModes={['yearly', 'fy']}
            />

            {/* Mode Toggle */}
            <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
              {([
                ['expense', 'Spending', TrendingDown],
                ['income', 'Earning', TrendingUp],
                ['net', 'Savings', DollarSign],
              ] as const).map(([val, label, Icon]) => (
                <motion.button
                  key={val}
                  role="tab"
                  aria-selected={mode === val}
                  onClick={() => setMode(val)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === val ? 'text-white' : 'text-muted-foreground hover:text-white hover:bg-white/10'
                    }`}
                  whileTap={{ scale: 0.97 }}
                >
                  {mode === val && (
                    <motion.div
                      layoutId="heatmapModeTab"
                      className="absolute inset-0 rounded-lg"
                      style={{ backgroundColor: modeAccent[val] }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <StatCard label="Total Spending" value={formatCurrencyCompact(stats.totalExpense)} icon={TrendingDown} color={rawColors.ios.red} />
        <StatCard label="Total Earning" value={formatCurrencyCompact(stats.totalIncome)} icon={TrendingUp} color={rawColors.ios.green} />
        <StatCard
          label="Savings Rate"
          value={`${stats.savingsRate.toFixed(1)}%`}
          icon={stats.savingsRate >= 0 ? ArrowUpRight : ArrowDownRight}
          color={stats.savingsRate >= 20 ? rawColors.ios.green : rawColors.ios.orange}
        />
        <StatCard label="Daily Average" value={formatCurrencyCompact(stats.dailyAvg)} icon={BarChart3} color={rawColors.ios.blue} />
      </div>

      {/* GitHub-style Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5" style={{ color: modeAccent[mode] }} />
            {{ expense: 'Spending', income: 'Earning', net: 'Savings' }[mode]} Heatmap — {isFYMode ? currentFY : selectedYear}
          </h2>
          {/* Legend */}
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span>Less</span>
            {heatmapColors[mode].map((color) => (
              <div
                key={color}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              {/* Month labels row */}
              <div className="flex ml-10 mb-1">
                {monthLabels.map((ml) => (
                  <div
                    key={`${ml.month}-${ml.weekIndex}`}
                    className="text-xs text-text-tertiary"
                    style={{
                      position: 'relative',
                      left: `${ml.weekIndex * 15}px`,
                      width: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ml.month}
                  </div>
                ))}
              </div>

              {/* Day rows (7 rows × N weeks) */}
              <div className="flex gap-0.5">
                {/* Day labels */}
                <div className="flex flex-col gap-0.5 mr-1.5 pt-0">
                  {DAYS.map((d, i) => (
                    <div key={d} className="h-[13px] flex items-center text-caption text-text-tertiary leading-none">
                      {i % 2 === 1 ? d : ''}
                    </div>
                  ))}
                </div>

                {/* Grid columns (weeks) */}
                <section
                  className="flex gap-0.5"
                  aria-label="Spending heatmap grid"
                  onMouseOver={(e) => {
                    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cell-date]')
                    if (target) {
                      const date = target.dataset.cellDate
                      const found = grid.find((c) => c.date === date)
                      setHoveredDay(found ?? null)
                    }
                  }}
                  onFocus={(e) => {
                    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cell-date]')
                    if (target) {
                      const date = target.dataset.cellDate
                      const found = grid.find((c) => c.date === date)
                      setHoveredDay(found ?? null)
                    }
                  }}
                  onMouseLeave={() => setHoveredDay(null)}
                  onBlur={() => setHoveredDay(null)}
                >
                  <HeatmapWeeks grid={grid} mode={mode} modeMax={modeMax} />
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile monthly summary — replaces heatmap on small screens */}
        <div className="md:hidden grid grid-cols-3 gap-2">
          {MONTHS_SHORT.map((m, i) => {
            const val = getMonthlyValue(mode, stats.monthlyExpense, stats.monthlyIncome, i)
            const maxVal = getMonthlyMax(mode, stats.monthlyExpense, stats.monthlyIncome)
            const level = getIntensityLevel(Math.abs(val), maxVal)
            return (
              <div
                key={m}
                className="p-3 rounded-xl text-center transition-colors"
                style={{ backgroundColor: heatmapColors[mode][level] }}
              >
                <div className="text-xs text-muted-foreground mb-1">{m}</div>
                <div className="text-sm font-semibold text-white">
                  {formatCurrencyCompact(Math.abs(val))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Inline day summary — always visible, no layout shift */}
        <div className="mt-4 pt-3 border-t border-border flex items-center gap-6 text-xs min-h-[28px]">
          {hoveredDay ? (
            <>
              <span className="text-white font-medium">
                {new Date(hoveredDay.date + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span className="text-ios-red">Spending: {formatCurrency(hoveredDay.expense)}</span>
              <span className="text-ios-green">Earning: {formatCurrency(hoveredDay.income)}</span>
              <span className={hoveredDay.net >= 0 ? 'text-ios-blue' : 'text-ios-orange'}>
                Savings: {hoveredDay.net >= 0 ? '+' : ''}{formatCurrency(hoveredDay.net)}
              </span>
            </>
          ) : (
            <>
              <span className="text-text-tertiary hidden md:inline">Hover over a day to see details</span>
              <span className="text-text-tertiary md:hidden">Tap a month to see details</span>
            </>
          )}
        </div>
      </motion.div >

      {/* Monthly Breakdown + Insights Grid */}
      < div className="grid grid-cols-1 lg:grid-cols-3 gap-6" >
        {/* Monthly bar chart */}
        < motion.div
          initial={{ opacity: 0, y: 20 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 glass rounded-2xl border border-border p-6"
        >
          <h2 className="text-lg font-semibold mb-4">Monthly Breakdown</h2>
          <div className="h-64">
            {monthlyBarData.length === 0 ? (
              <ChartEmptyState height={256} />
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={monthlyBarData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }} interval={getSmartInterval(monthlyBarData.length, dims.maxXLabels)} />
                  <YAxis tickFormatter={(v: number) => formatCurrencyShort(v)} tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }} />
                  <RechartsTooltip
                    {...chartTooltipProps}
                    formatter={(value: number | undefined) => (value === undefined ? '' : formatCurrency(value))}
                  />
                  <Bar dataKey="Spending" fill={rawColors.ios.red} radius={[4, 4, 0, 0]} opacity={0.8}>
                    {dims.showBarLabels && <LabelList dataKey="Spending" position="top" fill="#f5f5f7" fontSize={10} formatter={(v: number) => v === 0 ? '' : formatCurrencyShort(v)} />}
                  </Bar>
                  <Bar dataKey="Earning" fill={rawColors.ios.green} radius={[4, 4, 0, 0]} opacity={0.8}>
                    {dims.showBarLabels && <LabelList dataKey="Earning" position="top" fill="#f5f5f7" fontSize={10} formatter={(v: number) => v === 0 ? '' : formatCurrencyShort(v)} />}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div >

        {/* Quick insights */}
        < motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl border border-border p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5" style={{ color: rawColors.ios.orange }} />
            Quick Insights
          </h2>

          <InsightRow icon={Sun} label="Best Month (lowest spend)" value={stats.bestMonth} color={rawColors.ios.green} />
          <InsightRow icon={Moon} label="Worst Month (highest spend)" value={stats.worstMonth} color={rawColors.ios.red} />
          <InsightRow
            icon={Flame}
            label="Longest no-spend streak"
            value={`${stats.maxStreak} days`}
            color={rawColors.ios.orange}
          />
          <InsightRow
            icon={TrendingDown}
            label="Biggest spending day"
            value={stats.biggestExpenseDay.date ? `${formatCurrencyCompact(stats.biggestExpenseDay.amount)}` : 'N/A'}
            subtitle={stats.biggestExpenseDay.date
              ? new Date(stats.biggestExpenseDay.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
              : undefined}
            color={rawColors.ios.red}
          />
          <InsightRow
            icon={TrendingUp}
            label="Biggest earning day"
            value={stats.biggestIncomeDay.date ? `${formatCurrencyCompact(stats.biggestIncomeDay.amount)}` : 'N/A'}
            subtitle={stats.biggestIncomeDay.date
              ? new Date(stats.biggestIncomeDay.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
              : undefined}
            color={rawColors.ios.green}
          />
          <InsightRow
            icon={BarChart3}
            label="Days with expenses"
            value={`${stats.daysWithExpense} of ${grid.length}`}
            color={rawColors.ios.blue}
          />

          {/* Streak visualization */}
          {stats.maxStreak > 0 && (
            <div className="pt-3 mt-3 border-t border-border">
              <p className="text-xs text-text-tertiary mb-2">No-Spend Streak Record</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(stats.maxStreak, 30) }, (_, i) => (
                    <div
                      key={`streak-${i}`}
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: i < 7 ? rawColors.ios.green : i < 14 ? rawColors.ios.blue : rawColors.ios.purple,
                        opacity: 0.5 + (i / Math.min(stats.maxStreak, 30)) * 0.5,
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm font-bold" style={{ color: getStreakColor(stats.maxStreak) }}>
                  {stats.maxStreak} days
                </span>
              </div>
            </div>
          )}

          <div className="pt-3 mt-3 border-t border-border">
            <p className="text-xs text-text-tertiary mb-1">Total Savings</p>
            <p className={`text-xl font-bold ${stats.totalSavings >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
              {stats.totalSavings >= 0 ? '+' : ''}{formatCurrencyCompact(stats.totalSavings)}
            </p>
          </div>
        </motion.div >
      </div >

      {/* Day-of-Week Analysis */}
      < motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <h2 className="text-lg font-semibold mb-4">Spending by Day of Week</h2>
        <DayOfWeekChart grid={grid} />
      </motion.div >
    </div >
  )
}

