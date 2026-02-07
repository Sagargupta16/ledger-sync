import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Zap, Calendar, ArrowLeftRight } from 'lucide-react'
import { useState, useMemo, useCallback } from 'react'
import { useMonthlyAggregation } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'

type CompareMode = 'months' | 'years'

interface MetricRow {
  label: string
  period1Value: number
  period2Value: number
  change: number
  changePercent: number
  isExpense?: boolean
  format?: 'currency' | 'percent' | 'number' | 'days'
}

export default function PeriodComparison() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()
  const { data: transactions = [] } = useTransactions()
  const [compareMode, setCompareMode] = useState<CompareMode>('months')
  const [selectedMonth1, setSelectedMonth1] = useState<string | null>(null)
  const [selectedMonth2, setSelectedMonth2] = useState<string | null>(null)
  const [selectedYear1, setSelectedYear1] = useState<number | null>(null)
  const [selectedYear2, setSelectedYear2] = useState<number | null>(null)

  // Get all available months
  const availableMonths = useMemo(() => {
    if (!monthlyData) return []
    return Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...(data as { income: number; expense: number; net_savings: number }) }))
      .sort((a, b) => b.month.localeCompare(a.month))
  }, [monthlyData])

  // Get available years
  const availableYears = useMemo(() => {
    if (!monthlyData) return []
    const years = new Set<number>()
    Object.keys(monthlyData).forEach((month) => {
      years.add(Number.parseInt(month.slice(0, 4)))
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [monthlyData])

  // Effective selections with defaults
  const effectiveMonth1 = selectedMonth1 ?? availableMonths[0]?.month ?? null
  const effectiveMonth2 = selectedMonth2 ?? availableMonths[1]?.month ?? null
  const effectiveYear1 = selectedYear1 ?? availableYears[0] ?? null
  const effectiveYear2 = selectedYear2 ?? availableYears[1] ?? null

  // Calculate yearly aggregates
  const yearlyData = useMemo(() => {
    if (!monthlyData) return {}
    const yearly: Record<number, { income: number; expense: number; net_savings: number; months: number }> = {}
    
    Object.entries(monthlyData).forEach(([month, data]) => {
      const year = Number.parseInt(month.slice(0, 4))
      const d = data as { income: number; expense: number; net_savings: number }
      if (!yearly[year]) {
        yearly[year] = { income: 0, expense: 0, net_savings: 0, months: 0 }
      }
      yearly[year].income += d.income
      yearly[year].expense += d.expense
      yearly[year].net_savings += d.net_savings
      yearly[year].months += 1
    })
    
    return yearly
  }, [monthlyData])

  // Calculate transaction counts per period
  const transactionCounts = useMemo(() => {
    const counts: Record<string, { total: number; income: number; expense: number }> = {}
    
    transactions.forEach((tx) => {
      const month = tx.date.slice(0, 7)
      if (!counts[month]) {
        counts[month] = { total: 0, income: 0, expense: 0 }
      }
      counts[month].total += 1
      if (tx.type === 'Income') counts[month].income += 1
      else if (tx.type === 'Expense') counts[month].expense += 1
    })
    
    return counts
  }, [transactions])

  // Get transaction count for a period
  const getTransactionCount = useCallback((period: string | number, type: 'total' | 'income' | 'expense' = 'total') => {
    if (typeof period === 'number') {
      // Year - aggregate all months
      return Object.entries(transactionCounts)
        .filter(([month]) => month.startsWith(String(period)))
        .reduce((sum, [, counts]) => sum + counts[type], 0)
    }
    return transactionCounts[period]?.[type] ?? 0
  }, [transactionCounts])

  // Helper to create metric row
  function createMetricRow(
    label: string,
    value1: number,
    value2: number,
    format: 'currency' | 'percent' | 'number' | 'days' = 'currency',
    isExpense = false
  ): MetricRow {
    const change = value1 - value2
    const changePercent = value2 !== 0 ? (change / value2) * 100 : 0
    return { label, period1Value: value1, period2Value: value2, change, changePercent, isExpense, format }
  }

  // Calculate comparison metrics
  const comparisonMetrics = useMemo((): MetricRow[] | null => {
    if (compareMode === 'months') {
      if (!effectiveMonth1 || !effectiveMonth2 || !monthlyData) return null
      
      const m1 = availableMonths.find((m) => m.month === effectiveMonth1)
      const m2 = availableMonths.find((m) => m.month === effectiveMonth2)
      
      if (!m1 || !m2) return null

      // Calculate averages
      const avgIncome = availableMonths.reduce((sum, m) => sum + m.income, 0) / availableMonths.length
      const avgExpense = availableMonths.reduce((sum, m) => sum + m.expense, 0) / availableMonths.length

      // Daily rates (using actual days in each month)
      const daysInMonth1 = new Date(Number(effectiveMonth1.split('-')[0]), Number(effectiveMonth1.split('-')[1]), 0).getDate()
      const daysInMonth2 = new Date(Number(effectiveMonth2.split('-')[0]), Number(effectiveMonth2.split('-')[1]), 0).getDate()
      const dailyExpense1 = m1.expense / daysInMonth1
      const dailyExpense2 = m2.expense / daysInMonth2
      const dailyIncome1 = m1.income / daysInMonth1
      const dailyIncome2 = m2.income / daysInMonth2

      // Savings rate
      const savingsRate1 = m1.income > 0 ? (m1.net_savings / m1.income) * 100 : 0
      const savingsRate2 = m2.income > 0 ? (m2.net_savings / m2.income) * 100 : 0

      // Transaction counts
      const txCount1 = getTransactionCount(effectiveMonth1)
      const txCount2 = getTransactionCount(effectiveMonth2)
      const expenseTxCount1 = getTransactionCount(effectiveMonth1, 'expense')
      const expenseTxCount2 = getTransactionCount(effectiveMonth2, 'expense')

      // Avg transaction amount
      const avgTxAmount1 = expenseTxCount1 > 0 ? m1.expense / expenseTxCount1 : 0
      const avgTxAmount2 = expenseTxCount2 > 0 ? m2.expense / expenseTxCount2 : 0

      return [
        createMetricRow('Total Income', m1.income, m2.income, 'currency'),
        createMetricRow('Total Expenses', m1.expense, m2.expense, 'currency', true),
        createMetricRow('Net Savings', m1.net_savings, m2.net_savings, 'currency'),
        createMetricRow('Savings Rate', savingsRate1, savingsRate2, 'percent'),
        createMetricRow('Daily Avg Spending', dailyExpense1, dailyExpense2, 'currency', true),
        createMetricRow('Daily Avg Income', dailyIncome1, dailyIncome2, 'currency'),
        createMetricRow('Transaction Count', txCount1, txCount2, 'number'),
        createMetricRow('Avg Transaction Size', avgTxAmount1, avgTxAmount2, 'currency', true),
        createMetricRow('vs Average Income', m1.income, avgIncome, 'currency'),
        createMetricRow('vs Average Expense', m1.expense, avgExpense, 'currency', true),
      ]
    } else {
      // Year comparison
      if (!effectiveYear1 || !effectiveYear2) return null
      
      const y1 = yearlyData[effectiveYear1]
      const y2 = yearlyData[effectiveYear2]
      
      if (!y1 || !y2) return null

      // Monthly averages
      const monthlyIncomeAvg1 = y1.months > 0 ? y1.income / y1.months : 0
      const monthlyIncomeAvg2 = y2.months > 0 ? y2.income / y2.months : 0
      const monthlyExpenseAvg1 = y1.months > 0 ? y1.expense / y1.months : 0
      const monthlyExpenseAvg2 = y2.months > 0 ? y2.expense / y2.months : 0

      // Savings rate
      const savingsRate1 = y1.income > 0 ? (y1.net_savings / y1.income) * 100 : 0
      const savingsRate2 = y2.income > 0 ? (y2.net_savings / y2.income) * 100 : 0

      // Transaction counts
      const txCount1 = getTransactionCount(effectiveYear1)
      const txCount2 = getTransactionCount(effectiveYear2)
      const expenseTxCount1 = getTransactionCount(effectiveYear1, 'expense')
      const expenseTxCount2 = getTransactionCount(effectiveYear2, 'expense')

      // Avg transaction amount
      const avgTxAmount1 = expenseTxCount1 > 0 ? y1.expense / expenseTxCount1 : 0
      const avgTxAmount2 = expenseTxCount2 > 0 ? y2.expense / expenseTxCount2 : 0

      return [
        createMetricRow('Total Income', y1.income, y2.income, 'currency'),
        createMetricRow('Total Expenses', y1.expense, y2.expense, 'currency', true),
        createMetricRow('Net Savings', y1.net_savings, y2.net_savings, 'currency'),
        createMetricRow('Savings Rate', savingsRate1, savingsRate2, 'percent'),
        createMetricRow('Monthly Avg Income', monthlyIncomeAvg1, monthlyIncomeAvg2, 'currency'),
        createMetricRow('Monthly Avg Expense', monthlyExpenseAvg1, monthlyExpenseAvg2, 'currency', true),
        createMetricRow('Total Transactions', txCount1, txCount2, 'number'),
        createMetricRow('Avg Transaction Size', avgTxAmount1, avgTxAmount2, 'currency', true),
        createMetricRow('Months with Data', y1.months, y2.months, 'number'),
      ]
    }
  }, [compareMode, effectiveMonth1, effectiveMonth2, effectiveYear1, effectiveYear2, monthlyData, availableMonths, yearlyData, getTransactionCount])

  const formatValue = (value: number, format?: string) => {
    switch (format) {
      case 'percent':
        return `${value.toFixed(1)}%`
      case 'number':
        return value.toLocaleString()
      case 'days':
        return `${value.toFixed(0)} days`
      default:
        return formatCurrency(value)
    }
  }

  const getChangeIcon = (changePercent: number, isExpense = false) => {
    if (Math.abs(changePercent) < 1) return <Minus className="w-4 h-4 text-muted-foreground" />
    if (isExpense) {
      return changePercent > 0 ? (
        <TrendingUp className="w-4 h-4" style={{ color: rawColors.ios.red }} />
      ) : (
        <TrendingDown className="w-4 h-4" style={{ color: rawColors.ios.green }} />
      )
    }
    return changePercent > 0 ? (
      <TrendingUp className="w-4 h-4" style={{ color: rawColors.ios.green }} />
    ) : (
      <TrendingDown className="w-4 h-4" style={{ color: rawColors.ios.red }} />
    )
  }

  const getChangeColor = (changePercent: number, isExpense = false) => {
    if (Math.abs(changePercent) < 1) return rawColors.text.secondary
    if (isExpense) {
      return changePercent > 0 ? rawColors.ios.red : rawColors.ios.green
    }
    return changePercent > 0 ? rawColors.ios.green : rawColors.ios.red
  }

  const formatMonthLabel = (month: string) => {
    return new Date(month + '-01').toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
  }

  const getPeriod1Label = () => {
    if (compareMode === 'months' && effectiveMonth1) {
      return formatMonthLabel(effectiveMonth1)
    }
    return effectiveYear1?.toString() ?? ''
  }

  const getPeriod2Label = () => {
    if (compareMode === 'months' && effectiveMonth2) {
      return formatMonthLabel(effectiveMonth2)
    }
    return effectiveYear2?.toString() ?? ''
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-white/[0.08] p-6">
        <div className="h-8 skeleton w-1/3 mb-4" />
        <div className="h-64 skeleton" />
      </div>
    )
  }

  if (availableMonths.length < 2) {
    return (
      <div className="glass rounded-2xl border border-white/[0.08] p-6">
        <h3 className="text-lg font-semibold mb-2">Period Comparison</h3>
        <p style={{ color: rawColors.text.secondary }}>Need at least 2 months of data for comparison.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="glass rounded-2xl border border-white/[0.08] p-6 shadow-xl shadow-black/20"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="p-3 rounded-2xl" 
            style={{ 
              backgroundColor: `${rawColors.ios.indigo}26`,
              boxShadow: `0 8px 24px ${rawColors.ios.indigo}26`
            }}
          >
            <Zap className="w-6 h-6" style={{ color: rawColors.ios.indigo }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Quick Comparisons</h3>
            <p className="text-sm" style={{ color: rawColors.text.secondary }}>
              Compare {compareMode === 'months' ? 'monthly' : 'yearly'} performance
            </p>
          </div>
        </div>
      </div>

      {/* Mode Toggle & Selectors - iOS style */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 p-4 rounded-2xl glass-thin">
        {/* Mode Toggle - iOS segmented control */}
        <div className="flex bg-white/[0.06] rounded-xl p-1" role="tablist" aria-label="Compare mode">
          <button
            type="button"
            role="tab"
            aria-selected={compareMode === 'months'}
            onClick={() => setCompareMode('months')}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all"
            style={{ 
              backgroundColor: compareMode === 'months' ? rawColors.ios.blue : 'transparent',
              color: compareMode === 'months' ? '#fff' : rawColors.text.secondary
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compareMode === 'years'}
            onClick={() => setCompareMode('years')}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all"
            style={{ 
              backgroundColor: compareMode === 'years' ? rawColors.ios.blue : 'transparent',
              color: compareMode === 'years' ? '#fff' : rawColors.text.secondary
            }}
          >
            Yearly
          </button>
        </div>

        <div className="h-6 w-px bg-white/[0.08] hidden sm:block" />

        {/* Period Selectors - iOS style */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4" style={{ color: rawColors.text.tertiary }} />
          
          {compareMode === 'months' ? (
            <>
              <select
                value={effectiveMonth1 ?? ''}
                onChange={(e) => setSelectedMonth1(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[rgba(44,44,46,0.6)] border border-white/[0.08] text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors backdrop-blur-xl"
                aria-label="First month to compare"
              >
                {availableMonths.map((m) => (
                  <option key={m.month} value={m.month} className="bg-[#1c1c1e]">
                    {formatMonthLabel(m.month)}
                  </option>
                ))}
              </select>
              <ArrowLeftRight className="w-4 h-4" style={{ color: rawColors.text.tertiary }} />
              <select
                value={effectiveMonth2 ?? ''}
                onChange={(e) => setSelectedMonth2(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[rgba(44,44,46,0.6)] border border-white/[0.08] text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors backdrop-blur-xl"
                aria-label="Second month to compare"
              >
                {availableMonths.map((m) => (
                  <option key={m.month} value={m.month} className="bg-[#1c1c1e]">
                    {formatMonthLabel(m.month)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <select
                value={effectiveYear1 ?? ''}
                onChange={(e) => setSelectedYear1(Number.parseInt(e.target.value))}
                className="px-3 py-2 rounded-xl bg-[rgba(44,44,46,0.6)] border border-white/[0.08] text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors backdrop-blur-xl"
                aria-label="First year to compare"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year} className="bg-[#1c1c1e]">
                    {year}
                  </option>
                ))}
              </select>
              <ArrowLeftRight className="w-4 h-4" style={{ color: rawColors.text.tertiary }} />
              <select
                value={effectiveYear2 ?? ''}
                onChange={(e) => setSelectedYear2(Number.parseInt(e.target.value))}
                className="px-3 py-2 rounded-xl bg-[rgba(44,44,46,0.6)] border border-white/[0.08] text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors backdrop-blur-xl"
                aria-label="Second year to compare"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year} className="bg-[#1c1c1e]">
                    {year}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Comparison Table - iOS style */}
      {comparisonMetrics && comparisonMetrics.length > 0 ? (
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: rawColors.text.secondary }}>Metric</th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: rawColors.ios.blue }}>
                  {getPeriod1Label()}
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: rawColors.ios.purple }}>
                  {getPeriod2Label()}
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: rawColors.text.secondary }}>Change</th>
              </tr>
            </thead>
            <tbody>
              {comparisonMetrics.map((metric, index) => (
                <motion.tr
                  key={metric.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                >
                  <td className="py-3 px-4 text-sm font-medium text-white/90">
                    {metric.label}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-semibold" style={{ color: rawColors.ios.blue }}>
                    {formatValue(metric.period1Value, metric.format)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right" style={{ color: rawColors.ios.purple }}>
                    {formatValue(metric.period2Value, metric.format)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      {getChangeIcon(metric.changePercent, metric.isExpense)}
                      <span 
                        className="font-semibold"
                        style={{ color: getChangeColor(metric.changePercent, metric.isExpense) }}
                      >
                        {metric.changePercent > 0 ? '+' : ''}
                        {metric.changePercent.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8" style={{ color: rawColors.text.secondary }}>
          <p>Unable to calculate comparisons. Please select different periods.</p>
        </div>
      )}

      {/* Summary Cards - iOS style */}
      {comparisonMetrics && comparisonMetrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {/* Income Change */}
          <div 
            className="p-4 rounded-2xl"
            style={{ 
              backgroundColor: `${rawColors.ios.green}14`,
              borderWidth: 1,
              borderColor: `${rawColors.ios.green}26`
            }}
          >
            <p className="text-xs mb-1" style={{ color: rawColors.text.secondary }}>Income</p>
            <div className="flex items-center gap-1">
              {getChangeIcon(comparisonMetrics[0].changePercent)}
              <span 
                className="text-lg font-semibold"
                style={{ color: getChangeColor(comparisonMetrics[0].changePercent) }}
              >
                {comparisonMetrics[0].changePercent > 0 ? '+' : ''}
                {comparisonMetrics[0].changePercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Expense Change */}
          <div 
            className="p-4 rounded-2xl"
            style={{ 
              backgroundColor: `${rawColors.ios.red}14`,
              borderWidth: 1,
              borderColor: `${rawColors.ios.red}26`
            }}
          >
            <p className="text-xs mb-1" style={{ color: rawColors.text.secondary }}>Expenses</p>
            <div className="flex items-center gap-1">
              {getChangeIcon(comparisonMetrics[1].changePercent, true)}
              <span 
                className="text-lg font-semibold"
                style={{ color: getChangeColor(comparisonMetrics[1].changePercent, true) }}
              >
                {comparisonMetrics[1].changePercent > 0 ? '+' : ''}
                {comparisonMetrics[1].changePercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Savings Change */}
          <div 
            className="p-4 rounded-2xl"
            style={{ 
              backgroundColor: `${rawColors.ios.blue}14`,
              borderWidth: 1,
              borderColor: `${rawColors.ios.blue}26`
            }}
          >
            <p className="text-xs mb-1" style={{ color: rawColors.text.secondary }}>Savings</p>
            <div className="flex items-center gap-1">
              {getChangeIcon(comparisonMetrics[2].changePercent)}
              <span 
                className="text-lg font-semibold"
                style={{ color: getChangeColor(comparisonMetrics[2].changePercent) }}
              >
                {comparisonMetrics[2].changePercent > 0 ? '+' : ''}
                {comparisonMetrics[2].changePercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Savings Rate */}
          <div 
            className="p-4 rounded-2xl"
            style={{ 
              backgroundColor: `${rawColors.ios.purple}14`,
              borderWidth: 1,
              borderColor: `${rawColors.ios.purple}26`
            }}
          >
            <p className="text-xs mb-1" style={{ color: rawColors.text.secondary }}>Savings Rate</p>
            <span className="text-lg font-semibold" style={{ color: rawColors.ios.purple }}>
              {comparisonMetrics[3].period1Value.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </motion.div>
  )
}
