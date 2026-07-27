import { useMemo, useState } from 'react'
import { useTrends } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import {
  capSeriesToToday,
  dropPartialMonth,
  formatMonthKey,
  getDateKey,
  getMonthProgress,
  isPartialMonth,
} from '@/lib/dateUtils'
import { ROLLING_AVG_MONTHS, countRollingAvgPoints } from '@/lib/chartUtils'
import { percentChange } from '@/lib/formatters'
import { savingsRatePercentFromNet, savingsRatePercentOr } from '@/lib/savingsRate'
import { getTrendDirection } from './trendsUtils'
import type { TrendMetrics } from './types'

const DEFAULT_METRICS: TrendMetrics = {
  current: 0,
  previous: 0,
  change: 0,
  changePercent: 0,
  direction: 'stable',
  average: 0,
  highest: 0,
  lowest: 0,
}

/**
 * Mean of the values actually supplied, never of an assumed period count, so
 * the divisor cannot outrun the numerator. An empty basis yields 0 rather than
 * the `NaN` that would otherwise reach the cards.
 */
const mean = (values: readonly number[]): number =>
  values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0

export function useTrendsForecasts() {
  const preferencesQuery = usePreferences()
  const trendsQuery = useTrends('all_time')
  const transactionsQuery = useTransactions()

  const { data: preferences } = preferencesQuery
  const savingsGoalPercent = preferences?.savings_goal_percent ?? 20
  const { data: trendsData } = trendsQuery
  const { data: allTransactions = [] } = transactionsQuery
  const isLoading =
    preferencesQuery.isPending || trendsQuery.isPending || transactionsQuery.isPending
  const isError =
    preferencesQuery.isError || trendsQuery.isError || transactionsQuery.isError

  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(allTransactions, {
    availableModes: ['all_time', 'fy', 'yearly'],
  })

  const filteredMonthlyTrends = useMemo(() => {
    if (!trendsData?.monthly_trends) return []
    if (!dateRange.start_date) return trendsData.monthly_trends

    return trendsData.monthly_trends.filter((t) => {
      const monthStart = `${t.month}-01`
      if (dateRange.start_date && monthStart < dateRange.start_date.substring(0, 10)) return false
      if (dateRange.end_date && monthStart > dateRange.end_date.substring(0, 10)) return false
      return true
    })
  }, [trendsData, dateRange])

  /**
   * Month-over-month comparisons run on COMPLETE months only. The in-progress
   * month has partial income (salary lands late) against near-full fixed costs,
   * so leaving it in reported "spending is down 43%" and a savings rate in the
   * hundreds of percent negative -- artifacts of the calendar, not behaviour.
   * The page states the exclusion via `partialMonth` rather than silently
   * dropping a bar.
   *
   * `capSeriesToToday` runs first as a REGRESSION GUARD, not as a fix for
   * anything on screen today: the live ledger holds no bucket past the current
   * month (`substr(date,1,7) > '2026-07'` returns 0 rows, and its lone
   * forward-dated accrual sits inside July, which `dropPartialMonth` removes
   * anyway). It earns its place because `dropPartialMonth` drops only the
   * CURRENT month, so a bucket dated a month out would survive and become
   * `latest` -- the synthetic `2026-08` test fixture takes exactly that path.
   */
  const completeMonthlyTrends = useMemo(
    () => dropPartialMonth(capSeriesToToday(filteredMonthlyTrends, 'month'), 'month'),
    [filteredMonthlyTrends],
  )

  const partialMonth = useMemo(() => {
    const inProgress = filteredMonthlyTrends.find((t) => isPartialMonth(t.month))
    if (!inProgress) return null
    const { daysElapsed, daysTotal } = getMonthProgress(inProgress.month)
    return { label: formatMonthKey(inProgress.month), daysElapsed, daysTotal }
  }, [filteredMonthlyTrends])

  const metrics = useMemo(() => {
    if (completeMonthlyTrends.length < 1) {
      return { spending: DEFAULT_METRICS, income: DEFAULT_METRICS, savings: DEFAULT_METRICS }
    }

    const trends = completeMonthlyTrends
    const latest = trends.at(-1)
    if (!latest) {
      return { spending: DEFAULT_METRICS, income: DEFAULT_METRICS, savings: DEFAULT_METRICS }
    }
    const previous = trends.length > 1 ? (trends.at(-2) ?? latest) : latest

    const expenses = trends.map((t) => t.expenses)
    const spendingChange = latest.expenses - previous.expenses
    const spendingChangePercent = percentChange(latest.expenses, previous.expenses) ?? 0

    const incomes = trends.map((t) => t.income)
    const incomeChange = latest.income - previous.income
    const incomeChangePercent = percentChange(latest.income, previous.income) ?? 0

    const surpluses = trends.map((t) => t.surplus)
    const savingsChange = latest.surplus - previous.surplus
    const savingsChangePercent = percentChange(latest.surplus, previous.surplus) ?? 0

    return {
      spending: {
        current: latest.expenses,
        previous: previous.expenses,
        change: spendingChange,
        changePercent: spendingChangePercent,
        direction: getTrendDirection(spendingChangePercent),
        average: mean(expenses),
        highest: Math.max(...expenses),
        lowest: Math.min(...expenses),
      },
      income: {
        current: latest.income,
        previous: previous.income,
        change: incomeChange,
        changePercent: incomeChangePercent,
        direction: getTrendDirection(incomeChangePercent),
        average: mean(incomes),
        highest: Math.max(...incomes),
        lowest: Math.min(...incomes),
      },
      savings: {
        current: latest.surplus,
        previous: previous.surplus,
        change: savingsChange,
        changePercent: savingsChangePercent,
        direction: getTrendDirection(savingsChangePercent),
        average: mean(surpluses),
        highest: Math.max(...surpluses),
        lowest: Math.min(...surpluses),
      },
    }
  }, [completeMonthlyTrends])

  /**
   * How many complete months every average above divides by. Surfaced because
   * the cards label a figure "Average" without saying over what, so a 3-month
   * ledger and a 90-month one read identically.
   */
  const averageMonthCount = completeMonthlyTrends.length

  const chartData = useMemo(() => {
    if (!completeMonthlyTrends.length) return []

    return completeMonthlyTrends.map((t, index, arr) => {
      const prev = index > 0 ? arr[index - 1] : t
      // `surplus` is the net figure, so this is the from-net re-expression of the
      // one shared definition. The breakdown table renders it unclamped, which is
      // why a deficit month shows red rather than 0.
      const rawSavingsRate = savingsRatePercentFromNet(t.surplus, t.income) ?? 0
      return {
        ...t,
        spendingChange: index > 0 ? (percentChange(t.expenses, prev.expenses) ?? 0) : 0,
        incomeChange: index > 0 ? (percentChange(t.income, prev.income) ?? 0) : 0,
        rawSavingsRate,
      }
    })
  }, [completeMonthlyTrends])

  const filteredTransactions = useMemo(() => {
    if (!allTransactions.length) return []
    const startDate = dateRange.start_date
    if (!startDate) return allTransactions

    return allTransactions.filter((t) => {
      const txDate = getDateKey(t.date)
      return txDate >= startDate && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  /**
   * Running (cumulative) savings rate by day. HISTORICAL, so it stops at today.
   *
   * Forward-dated accruals are real (the workbook books 3,600 of EPF on
   * 2026-07-31). FY and yearly windows already exclude them -- `end_date` is
   * capped by `getAnalyticsDateRange` -- but ALL-TIME is unbounded, so the line
   * ran past today on income not yet received. Measured read-only against the
   * live workbook 2026-07-27: 35.6676% uncapped vs 35.6303% as of today.
   *
   * The partial month stays: this is cumulative to-date, not month-vs-month, and
   * `partialMonth` already states the caveat.
   *
   * A deficit is published as the NEGATIVE number it is. This used to plot
   * `Math.max(0, savingsRate)` and carry the true figure alongside as
   * `rawSavingsRate` for the tooltip only, so a day the user spent more than
   * they had earned sat exactly on the axis while hovering it read
   * "-3.0% (deficit)" -- the chart and its own tooltip disagreeing. The clamp
   * was reachable on real data: the live ledger's all-time cumulative series
   * flatlines on 6 of 1,515 days (measured read-only 2026-07-27, first
   * 2020-12-16 at -3.03%), and a shorter window makes it likelier, since early
   * cumulative sums are the ones a single large expense can outrun. Consumers
   * now read one field and the y-axis extends below zero to show it.
   */
  const dailySavingsData = useMemo(() => {
    if (!filteredTransactions.length) return []

    const dailyMap: Record<string, { income: number; expense: number }> = {}
    for (const tx of filteredTransactions) {
      const day = tx.date.substring(0, 10)
      if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
      if (tx.type === 'Income') dailyMap[day].income += tx.amount
      else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
    }

    const sortedDays = capSeriesToToday(
      Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, totals]) => ({ date, ...totals })),
      'date',
    )
    let cumIncome = 0
    let cumExpense = 0

    return sortedDays.map(({ date, income, expense }) => {
      cumIncome += income
      cumExpense += expense
      const savingsRate = savingsRatePercentOr({ income: cumIncome, expense: cumExpense })
      return { date, savingsRate }
    })
  }, [filteredTransactions])

  const monthlyTrendChartData = useMemo(() => {
    if (!completeMonthlyTrends.length) return []
    return completeMonthlyTrends.map((t) => ({
      month: t.month,
      label: formatMonthKey(t.month, { month: 'short', year: '2-digit' }),
      income: t.income,
      expenses: t.expenses,
      savings: t.surplus,
    }))
  }, [completeMonthlyTrends])

  /**
   * Trailing average over exactly `ROLLING_AVG_MONTHS` complete months.
   *
   * The window used to be `slice(max(0, i - 2), i + 1)` divided by its own
   * length, so the first two points divided by 1 and 2 while the legend still
   * read "3m avg". On the real all-time series point 0 plotted 5,000.00 (one
   * month's income verbatim) and point 1 plotted 2,500.00; on the default FY
   * window they plotted 225,835.32 and 225,311.86. None of those four is a
   * 3-month mean, so the label was false wherever the window was short.
   *
   * A short window now yields `undefined`. That leaves FEWER average points than
   * data points, which is why `rollingAvgPointCount` exists -- see its note.
   */
  const monthlyTrendWithAvg = useMemo(
    () =>
      monthlyTrendChartData.map((d, i) => {
        const window =
          i + 1 >= ROLLING_AVG_MONTHS
            ? monthlyTrendChartData.slice(i + 1 - ROLLING_AVG_MONTHS, i + 1)
            : null
        return {
          ...d,
          incomeAvg: window ? mean(window.map((w) => w.income)) : undefined,
          expensesAvg: window ? mean(window.map((w) => w.expenses)) : undefined,
          savingsAvg: window ? mean(window.map((w) => w.savings)) : undefined,
        }
      }),
    [monthlyTrendChartData],
  )

  /**
   * How many rolling-average points actually exist -- see `countRollingAvgPoints`.
   *
   * Probed against recharts 3.10 with the real FY 2026-27 months (Apr/May/Jun
   * complete): the average path is `d="M595,25.2630323076923Z"`, a moveto plus
   * closepath that paints nothing, versus a full 3-point curve back when the
   * window truncated. All three series share one window, so counting `incomeAvg`
   * answers for `expensesAvg` and `savingsAvg` too.
   */
  const rollingAvgPointCount = useMemo(
    () => countRollingAvgPoints(monthlyTrendWithAvg, (d) => d.incomeAvg),
    [monthlyTrendWithAvg],
  )

  const peakIncome = useMemo(
    () => Math.max(...monthlyTrendChartData.map((d) => d.income), 0),
    [monthlyTrendChartData],
  )
  const peakExpenses = useMemo(
    () => Math.max(...monthlyTrendChartData.map((d) => d.expenses), 0),
    [monthlyTrendChartData],
  )
  const peakSavings = useMemo(
    // Don't floor at 0: an all-deficit user's true peak is the least-negative
    // month, and a `Peak: ₹0` line at a value no month hit is misleading. Guard
    // the empty-array spread separately.
    () => (monthlyTrendChartData.length ? Math.max(...monthlyTrendChartData.map((d) => d.savings)) : 0),
    [monthlyTrendChartData],
  )

  const recentChartData = useMemo(() => chartData.slice(-8), [chartData])

  const [activeLabel, setActiveLabel] = useState<string | null>(null)

  const retry = () => {
    const retries: Array<Promise<unknown>> = []
    if (preferencesQuery.isError) retries.push(preferencesQuery.refetch())
    if (trendsQuery.isError) retries.push(trendsQuery.refetch())
    if (transactionsQuery.isError) retries.push(transactionsQuery.refetch())
    void Promise.all(retries)
  }

  return {
    savingsGoalPercent,
    isLoading,
    isError,
    retry,
    timeFilterProps,
    metrics,
    averageMonthCount,
    rollingAvgMonths: ROLLING_AVG_MONTHS,
    partialMonth,
    chartData,
    dailySavingsData,
    monthlyTrendWithAvg,
    rollingAvgPointCount,
    peakIncome,
    peakExpenses,
    peakSavings,
    recentChartData,
    activeLabel,
    setActiveLabel,
  }
}
