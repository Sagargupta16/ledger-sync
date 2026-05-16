import { useCallback, useMemo, useState } from 'react'

import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'

import { useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { rawColors } from '@/constants/colors'

import { ChangeDisplay, SummaryCard } from './period-comparison/PeriodChangeDisplay'
import { PeriodSelectors } from './period-comparison/PeriodSelectors'
import {
  buildMonthlyMetrics,
  buildYearlyMetrics,
  formatMonthLabel,
  formatValue,
  type CompareMode,
  type MetricRow,
  type MonthData,
  type TransactionType,
  type YearData,
} from './period-comparison/periodMetrics'

export default function PeriodComparison() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()
  const { data: transactions = [] } = useTransactions()
  const [compareMode, setCompareMode] = useState<CompareMode>('months')
  const [selectedMonth1, setSelectedMonth1] = useState<string | null>(null)
  const [selectedMonth2, setSelectedMonth2] = useState<string | null>(null)
  const [selectedYear1, setSelectedYear1] = useState<number | null>(null)
  const [selectedYear2, setSelectedYear2] = useState<number | null>(null)

  const availableMonths = useMemo<MonthData[]>(() => {
    if (!monthlyData) return []
    return Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        ...(data as { income: number; expense: number; net_savings: number }),
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
  }, [monthlyData])

  const availableYears = useMemo(() => {
    if (!monthlyData) return []
    const years = new Set<number>()
    Object.keys(monthlyData).forEach((month) => {
      years.add(Number.parseInt(month.slice(0, 4)))
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [monthlyData])

  const effectiveMonth1 = selectedMonth1 ?? availableMonths[0]?.month ?? null
  const effectiveMonth2 = selectedMonth2 ?? availableMonths[1]?.month ?? null
  const effectiveYear1 = selectedYear1 ?? availableYears[0] ?? null
  const effectiveYear2 = selectedYear2 ?? availableYears[1] ?? null

  const yearlyData = useMemo(() => {
    if (!monthlyData) return {}
    const yearly: Record<number, YearData> = {}

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

  const getTransactionCount = useCallback(
    (period: string | number, type: TransactionType = 'total') => {
      if (typeof period === 'number') {
        return Object.entries(transactionCounts)
          .filter(([month]) => month.startsWith(String(period)))
          .reduce((sum, [, counts]) => sum + counts[type], 0)
      }
      return transactionCounts[period]?.[type] ?? 0
    },
    [transactionCounts],
  )

  const comparisonMetrics = useMemo((): MetricRow[] | null => {
    if (compareMode === 'months') {
      if (!effectiveMonth1 || !effectiveMonth2 || !monthlyData) return null
      const m1 = availableMonths.find((m) => m.month === effectiveMonth1)
      const m2 = availableMonths.find((m) => m.month === effectiveMonth2)
      if (!m1 || !m2) return null
      return buildMonthlyMetrics(
        m1,
        m2,
        effectiveMonth1,
        effectiveMonth2,
        availableMonths,
        getTransactionCount,
      )
    }

    if (!effectiveYear1 || !effectiveYear2) return null
    const y1 = yearlyData[effectiveYear1]
    const y2 = yearlyData[effectiveYear2]
    if (!y1 || !y2) return null
    return buildYearlyMetrics(y1, y2, effectiveYear1, effectiveYear2, getTransactionCount)
  }, [
    compareMode,
    effectiveMonth1,
    effectiveMonth2,
    effectiveYear1,
    effectiveYear2,
    monthlyData,
    availableMonths,
    yearlyData,
    getTransactionCount,
  ])

  const getPeriod1Label = () => {
    if (compareMode === 'months' && effectiveMonth1) return formatMonthLabel(effectiveMonth1)
    return effectiveYear1?.toString() ?? ''
  }

  const getPeriod2Label = () => {
    if (compareMode === 'months' && effectiveMonth2) return formatMonthLabel(effectiveMonth2)
    return effectiveYear2?.toString() ?? ''
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-border p-6">
        <div className="h-8 skeleton w-1/3 mb-4" />
        <div className="h-64 skeleton" />
      </div>
    )
  }

  if (availableMonths.length < 2) {
    return (
      <div className="glass rounded-2xl border border-border p-6">
        <h3 className="text-lg font-semibold mb-2">Period Comparison</h3>
        <p style={{ color: rawColors.text.secondary }}>
          Need at least 2 months of data for comparison.
        </p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="p-3 rounded-2xl"
            style={{
              backgroundColor: `${rawColors.app.indigo}26`,
              boxShadow: `0 8px 24px ${rawColors.app.indigo}26`,
            }}
          >
            <Zap className="w-6 h-6" style={{ color: rawColors.app.indigo }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Quick Comparisons</h3>
            <p className="text-sm" style={{ color: rawColors.text.secondary }}>
              Compare {compareMode === 'months' ? 'monthly' : 'yearly'} performance
            </p>
          </div>
        </div>
      </div>

      <PeriodSelectors
        compareMode={compareMode}
        setCompareMode={setCompareMode}
        availableMonths={availableMonths}
        availableYears={availableYears}
        effectiveMonth1={effectiveMonth1}
        effectiveMonth2={effectiveMonth2}
        effectiveYear1={effectiveYear1}
        effectiveYear2={effectiveYear2}
        setSelectedMonth1={setSelectedMonth1}
        setSelectedMonth2={setSelectedMonth2}
        setSelectedYear1={setSelectedYear1}
        setSelectedYear2={setSelectedYear2}
      />

      {comparisonMetrics && comparisonMetrics.length > 0 ? (
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th
                  className="text-left py-3 px-4 text-sm font-semibold"
                  style={{ color: rawColors.text.secondary }}
                >
                  Metric
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold"
                  style={{ color: rawColors.app.blue }}
                >
                  {getPeriod1Label()}
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold"
                  style={{ color: rawColors.app.purple }}
                >
                  {getPeriod2Label()}
                </th>
                <th
                  className="text-right py-3 px-4 text-sm font-semibold"
                  style={{ color: rawColors.text.secondary }}
                >
                  Change
                </th>
              </tr>
            </thead>
            <motion.tbody
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {comparisonMetrics.map((metric) => (
                <tr
                  key={metric.label}
                  className="border-b border-border hover:bg-white/10 transition-colors"
                >
                  <td className="py-3 px-4 text-sm font-medium text-white/90">{metric.label}</td>
                  <td
                    className="py-3 px-4 text-sm text-right font-semibold"
                    style={{ color: rawColors.app.blue }}
                  >
                    {formatValue(metric.period1Value, metric.format)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right" style={{ color: rawColors.app.purple }}>
                    {formatValue(metric.period2Value, metric.format)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right">
                    <ChangeDisplay
                      changePercent={metric.changePercent}
                      isExpense={metric.isExpense}
                    />
                  </td>
                </tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8" style={{ color: rawColors.text.secondary }}>
          <p>Unable to calculate comparisons. Please select different periods.</p>
        </div>
      )}

      {comparisonMetrics && comparisonMetrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <SummaryCard
            label="Income"
            color={rawColors.app.green}
            changePercent={comparisonMetrics[0].changePercent}
          />
          <SummaryCard
            label="Expenses"
            color={rawColors.app.red}
            changePercent={comparisonMetrics[1].changePercent}
            isExpense
          />
          <SummaryCard
            label="Savings"
            color={rawColors.app.blue}
            changePercent={comparisonMetrics[2].changePercent}
          />
          <SummaryCard
            label="Savings Rate"
            color={rawColors.app.purple}
            changePercent={comparisonMetrics[3].changePercent}
            showRate
            rateValue={comparisonMetrics[3].period1Value}
          />
        </div>
      )}
    </motion.div>
  )
}
