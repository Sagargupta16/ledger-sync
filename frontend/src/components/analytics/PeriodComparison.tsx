import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Zap, ArrowRight, Calendar } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useMonthlyAggregation } from '@/hooks/useAnalytics'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

interface ComparisonData {
  label: string
  current: number
  previous: number
  change: number
  changePercent: number
}

export default function PeriodComparison() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()
  const [compareMonth1, setCompareMonth1] = useState<string | null>(null)
  const [compareMonth2, setCompareMonth2] = useState<string | null>(null)

  // Get all available months (excluding incomplete current month)
  const availableMonths = useMemo(() => {
    if (!monthlyData) return []

    const months = Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...(data as { income: number; expense: number; net_savings: number }) }))
      .sort((a, b) => b.month.localeCompare(a.month)) // Most recent first

    if (months.length < 2) return []

    // Check if current month is incomplete
    const today = new Date()
    const currentMonth = today.toISOString().slice(0, 7)
    const dayOfMonth = today.getDate()
    const currentMonthIncomplete = dayOfMonth < 15

    // Filter out incomplete current month
    return months.filter((m) => !(m.month === currentMonth && currentMonthIncomplete))
  }, [monthlyData])

  // Derive effective selected months - use state if set, otherwise defaults
  const effectiveMonth1 = compareMonth1 ?? (availableMonths.length >= 1 ? availableMonths[0].month : null)
  const effectiveMonth2 = compareMonth2 ?? (availableMonths.length >= 2 ? availableMonths[1].month : null)

  // Calculate comparisons based on selected months
  const comparisons = useMemo(() => {
    if (!monthlyData || availableMonths.length < 2 || !effectiveMonth1 || !effectiveMonth2) return null

    const month1Data = availableMonths.find((m) => m.month === effectiveMonth1)
    const month2Data = availableMonths.find((m) => m.month === effectiveMonth2)

    if (!month1Data || !month2Data) return null

    // Month 1 is the "current" month, Month 2 is the "previous/comparison" month
    const currentMonthData = month1Data
    const previousMonthData = month2Data

    // Calculate year-ago month for month1 if available
    const targetYearMonth = currentMonthData.month
    const yearAgoMonth = `${parseInt(targetYearMonth.slice(0, 4)) - 1}${targetYearMonth.slice(4)}`
    const yearAgoData = availableMonths.find((m) => m.month === yearAgoMonth)

    // Calculate averages (all available months)
    const avgExpense = availableMonths.reduce((sum, m) => sum + m.expense, 0) / availableMonths.length

    const results: {
      monthLabel: string
      comparedToLabel: string
      thisMonth: ComparisonData
      vsLastMonth: ComparisonData
      vsYearAgo: ComparisonData | null
      vsAverage: ComparisonData
      spendingVelocity: {
        avgDaily: number
        previousAvgDaily: number
        change: number
      }
    } = {
      monthLabel: new Date(currentMonthData.month + '-01').toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      comparedToLabel: new Date(previousMonthData.month + '-01').toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      thisMonth: {
        label: 'Income Comparison',
        current: currentMonthData.income,
        previous: previousMonthData.income,
        change: currentMonthData.income - previousMonthData.income,
        changePercent:
          previousMonthData.income > 0
            ? ((currentMonthData.income - previousMonthData.income) / previousMonthData.income) * 100
            : 0,
      },
      vsLastMonth: {
        label: 'Spending Comparison',
        current: currentMonthData.expense,
        previous: previousMonthData.expense,
        change: currentMonthData.expense - previousMonthData.expense,
        changePercent:
          previousMonthData.expense > 0
            ? ((currentMonthData.expense - previousMonthData.expense) / previousMonthData.expense) * 100
            : 0,
      },
      vsYearAgo: yearAgoData
        ? {
            label: 'vs Same Month Last Year',
            current: currentMonthData.expense,
            previous: yearAgoData.expense,
            change: currentMonthData.expense - yearAgoData.expense,
            changePercent:
              yearAgoData.expense > 0
                ? ((currentMonthData.expense - yearAgoData.expense) / yearAgoData.expense) * 100
                : 0,
          }
        : null,
      vsAverage: {
        label: 'vs Average Spending',
        current: currentMonthData.expense,
        previous: avgExpense,
        change: currentMonthData.expense - avgExpense,
        changePercent: avgExpense > 0 ? ((currentMonthData.expense - avgExpense) / avgExpense) * 100 : 0,
      },
      spendingVelocity: {
        avgDaily: 0,
        previousAvgDaily: 0,
        change: 0,
      },
    }

    // Calculate average daily spending for both months (30 days assumption)
    const currentDailyRate = currentMonthData.expense / 30
    const previousDailyRate = previousMonthData.expense / 30

    results.spendingVelocity = {
      avgDaily: currentDailyRate,
      previousAvgDaily: previousDailyRate,
      change: previousDailyRate > 0 ? ((currentDailyRate - previousDailyRate) / previousDailyRate) * 100 : 0,
    }

    return results
  }, [monthlyData, availableMonths, effectiveMonth1, effectiveMonth2])

  const getChangeIcon = (change: number, isExpense = false) => {
    if (Math.abs(change) < 2) return <Minus className="w-4 h-4 text-muted-foreground" />
    if (isExpense) {
      return change > 0 ? (
        <TrendingUp className="w-4 h-4 text-red-500" />
      ) : (
        <TrendingDown className="w-4 h-4 text-green-500" />
      )
    }
    return change > 0 ? (
      <TrendingUp className="w-4 h-4 text-green-500" />
    ) : (
      <TrendingDown className="w-4 h-4 text-red-500" />
    )
  }

  const getChangeColor = (change: number, isExpense = false) => {
    if (Math.abs(change) < 2) return 'text-muted-foreground'
    if (isExpense) {
      return change > 0 ? 'text-red-500' : 'text-green-500'
    }
    return change > 0 ? 'text-green-500' : 'text-red-500'
  }

  const formatMonthLabel = (month: string) => {
    return new Date(month + '-01').toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (!comparisons || availableMonths.length < 2) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-semibold mb-2">Period Comparison</h3>
        <p className="text-muted-foreground">Need at least 2 months of data for comparison.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 rounded-xl">
            <Zap className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Quick Comparisons</h3>
            <p className="text-sm text-muted-foreground">
              {comparisons.monthLabel} vs {comparisons.comparedToLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Month Selectors */}
      <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-background/30 border border-white/5">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Compare</span>
          <select
            value={effectiveMonth1 ?? ''}
            onChange={(e) => setCompareMonth1(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-sm text-white cursor-pointer hover:bg-zinc-700 transition-colors [&>option]:bg-zinc-800 [&>option]:text-white"
          >
            {availableMonths.map((m) => (
              <option key={m.month} value={m.month}>
                {formatMonthLabel(m.month)}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">with</span>
          <select
            value={effectiveMonth2 ?? ''}
            onChange={(e) => setCompareMonth2(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-sm text-white cursor-pointer hover:bg-zinc-700 transition-colors [&>option]:bg-zinc-800 [&>option]:text-white"
          >
            {availableMonths.map((m) => (
              <option key={m.month} value={m.month}>
                {formatMonthLabel(m.month)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Income Comparison */}
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-muted-foreground mb-1">Income</p>
          <div className="flex items-center gap-2">
            {getChangeIcon(comparisons.thisMonth.changePercent)}
            <span className={`text-lg font-bold ${getChangeColor(comparisons.thisMonth.changePercent)}`}>
              {comparisons.thisMonth.changePercent > 0 ? '+' : ''}
              {comparisons.thisMonth.changePercent.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCurrencyShort(comparisons.thisMonth.current)} vs {formatCurrencyShort(comparisons.thisMonth.previous)}
          </p>
        </div>

        {/* Spending Comparison */}
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-muted-foreground mb-1">Spending</p>
          <div className="flex items-center gap-2">
            {getChangeIcon(comparisons.vsLastMonth.changePercent, true)}
            <span className={`text-lg font-bold ${getChangeColor(comparisons.vsLastMonth.changePercent, true)}`}>
              {comparisons.vsLastMonth.changePercent > 0 ? '+' : ''}
              {comparisons.vsLastMonth.changePercent.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCurrencyShort(comparisons.vsLastMonth.current)} vs{' '}
            {formatCurrencyShort(comparisons.vsLastMonth.previous)}
          </p>
        </div>

        {/* vs Average */}
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-muted-foreground mb-1">vs Average Spending</p>
          <div className="flex items-center gap-2">
            {getChangeIcon(comparisons.vsAverage.changePercent, true)}
            <span className={`text-lg font-bold ${getChangeColor(comparisons.vsAverage.changePercent, true)}`}>
              {comparisons.vsAverage.changePercent > 0 ? '+' : ''}
              {comparisons.vsAverage.changePercent.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Avg: {formatCurrencyShort(comparisons.vsAverage.previous)}</p>
        </div>

        {/* Daily Spending Rate */}
        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <p className="text-xs text-muted-foreground mb-1">Avg Daily Spending</p>
          <p className="text-lg font-bold text-purple-500">{formatCurrency(comparisons.spendingVelocity.avgDaily)}/day</p>
          <p className="text-xs text-muted-foreground mt-1">
            vs {formatCurrencyShort(comparisons.spendingVelocity.previousAvgDaily)}/day
          </p>
        </div>
      </div>

      {/* Year over Year if available */}
      {comparisons.vsYearAgo && (
        <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">vs Same Month Last Year</p>
              <div className="flex items-center gap-2">
                {getChangeIcon(comparisons.vsYearAgo.changePercent, true)}
                <span className={`text-lg font-bold ${getChangeColor(comparisons.vsYearAgo.changePercent, true)}`}>
                  {comparisons.vsYearAgo.changePercent > 0 ? '+' : ''}
                  {comparisons.vsYearAgo.changePercent.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{formatCurrencyShort(comparisons.vsYearAgo.previous)}</span>
              <ArrowRight className="w-4 h-4" />
              <span>{formatCurrencyShort(comparisons.vsYearAgo.current)}</span>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
