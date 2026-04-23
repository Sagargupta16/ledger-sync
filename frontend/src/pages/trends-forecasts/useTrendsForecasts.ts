import { useMemo, useState } from 'react'
import { useTrends } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { getDateKey } from '@/lib/dateUtils'
import { percentChange } from '@/lib/formatters'
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

export function useTrendsForecasts() {
  const { data: preferences } = usePreferences()
  const savingsGoalPercent = preferences?.savings_goal_percent ?? 20

  const { data: trendsData, isLoading } = useTrends('all_time')
  const { data: allTransactions = [] } = useTransactions()

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

  const metrics = useMemo(() => {
    if (!filteredMonthlyTrends || filteredMonthlyTrends.length < 1) {
      return { spending: DEFAULT_METRICS, income: DEFAULT_METRICS, savings: DEFAULT_METRICS }
    }

    const trends = filteredMonthlyTrends
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
        average: expenses.reduce((a, b) => a + b, 0) / expenses.length,
        highest: Math.max(...expenses),
        lowest: Math.min(...expenses),
      },
      income: {
        current: latest.income,
        previous: previous.income,
        change: incomeChange,
        changePercent: incomeChangePercent,
        direction: getTrendDirection(incomeChangePercent),
        average: incomes.reduce((a, b) => a + b, 0) / incomes.length,
        highest: Math.max(...incomes),
        lowest: Math.min(...incomes),
      },
      savings: {
        current: latest.surplus,
        previous: previous.surplus,
        change: savingsChange,
        changePercent: savingsChangePercent,
        direction: getTrendDirection(savingsChangePercent),
        average: surpluses.reduce((a, b) => a + b, 0) / surpluses.length,
        highest: Math.max(...surpluses),
        lowest: Math.min(...surpluses),
      },
    }
  }, [filteredMonthlyTrends])

  const chartData = useMemo(() => {
    if (!filteredMonthlyTrends.length) return []

    return filteredMonthlyTrends.map((t, index, arr) => {
      const prev = index > 0 ? arr[index - 1] : t
      const rawSavingsRate = t.income > 0 ? (t.surplus / t.income) * 100 : 0
      return {
        ...t,
        spendingChange: index > 0 ? (percentChange(t.expenses, prev.expenses) ?? 0) : 0,
        incomeChange: index > 0 ? (percentChange(t.income, prev.income) ?? 0) : 0,
        rawSavingsRate,
        savingsRate: Math.max(0, rawSavingsRate),
      }
    })
  }, [filteredMonthlyTrends])

  const filteredTransactions = useMemo(() => {
    if (!allTransactions.length) return []
    const startDate = dateRange.start_date
    if (!startDate) return allTransactions

    return allTransactions.filter((t) => {
      const txDate = getDateKey(t.date)
      return txDate >= startDate && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  const dailySavingsData = useMemo(() => {
    if (!filteredTransactions.length) return []

    const dailyMap: Record<string, { income: number; expense: number }> = {}
    for (const tx of filteredTransactions) {
      const day = tx.date.substring(0, 10)
      if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
      if (tx.type === 'Income') dailyMap[day].income += tx.amount
      else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
    }

    const sortedDays = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
    let cumIncome = 0
    let cumExpense = 0

    return sortedDays.map(([date, { income, expense }]) => {
      cumIncome += income
      cumExpense += expense
      const savingsRate = cumIncome > 0 ? ((cumIncome - cumExpense) / cumIncome) * 100 : 0
      return {
        date,
        savingsRate: Math.max(0, savingsRate),
        rawSavingsRate: savingsRate,
      }
    })
  }, [filteredTransactions])

  const monthlyTrendChartData = useMemo(() => {
    if (!filteredMonthlyTrends.length) return []
    return filteredMonthlyTrends.map((t) => ({
      month: t.month,
      label: new Date(t.month + '-01').toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      }),
      income: t.income,
      expenses: t.expenses,
      savings: t.surplus,
    }))
  }, [filteredMonthlyTrends])

  const monthlyTrendWithAvg = useMemo(
    () =>
      monthlyTrendChartData.map((d, i) => {
        const start = Math.max(0, i - 2)
        const window = monthlyTrendChartData.slice(start, i + 1)
        return {
          ...d,
          incomeAvg: window.reduce((s, w) => s + w.income, 0) / window.length,
          expensesAvg: window.reduce((s, w) => s + w.expenses, 0) / window.length,
          savingsAvg: window.reduce((s, w) => s + w.savings, 0) / window.length,
        }
      }),
    [monthlyTrendChartData],
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
    () => Math.max(...monthlyTrendChartData.map((d) => d.savings), 0),
    [monthlyTrendChartData],
  )

  const [trendSortKey, setTrendSortKey] = useState<string | null>(null)
  const [trendSortDir, setTrendSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleTrendSort = (key: string) => {
    if (trendSortKey === key) {
      setTrendSortDir(trendSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setTrendSortKey(key)
      setTrendSortDir('desc')
    }
  }

  const sortedChartData = useMemo(() => {
    const data = chartData.slice(-8)
    if (!trendSortKey) return data
    return [...data].sort((a, b) => {
      const av = a[trendSortKey as keyof typeof a]
      const bv = b[trendSortKey as keyof typeof b]
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return trendSortDir === 'asc' ? cmp : -cmp
    })
  }, [chartData, trendSortKey, trendSortDir])

  const [activeLabel, setActiveLabel] = useState<string | null>(null)

  return {
    savingsGoalPercent,
    isLoading,
    timeFilterProps,
    metrics,
    chartData,
    dailySavingsData,
    monthlyTrendWithAvg,
    peakIncome,
    peakExpenses,
    peakSavings,
    trendSortKey,
    trendSortDir,
    toggleTrendSort,
    sortedChartData,
    activeLabel,
    setActiveLabel,
  }
}
