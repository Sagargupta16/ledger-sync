import { useMemo, useState } from 'react'

import { motion } from 'motion/react'
import { Zap } from 'lucide-react'

import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import { useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { rawColors } from '@/constants/colors'

import { ChangeDisplay, SummaryCard } from './period-comparison/PeriodChangeDisplay'
import { PeriodSelectors } from './period-comparison/PeriodSelectors'
import {
  formatMonthLabel,
  formatValue,
  type CompareMode,
  type MetricRow,
} from './period-comparison/periodMetrics'
import {
  buildComparisonMetrics,
  deriveAvailableMonths,
  deriveAvailableYears,
  deriveTransactionCounts,
  deriveYearlyData,
  makeGetTransactionCount,
} from './periodComparisonUtils'

function buildComparisonColumns(
  period1Label: string,
  period2Label: string,
): DataTableColumn<MetricRow>[] {
  return [
    {
      key: 'label',
      header: 'Metric',
      mobilePrimary: true,
      cell: (metric) => (
        <span className="font-medium text-foreground">{metric.label}</span>
      ),
    },
    {
      key: 'period1Value',
      header: period1Label,
      align: 'right',
      mobileLabel: period1Label,
      cell: (metric) => (
        <Money
          value={metric.period1Value}
          formatter={(value) => formatValue(value, metric.format)}
          bold
          className="text-app-blue"
        />
      ),
    },
    {
      key: 'period2Value',
      header: period2Label,
      align: 'right',
      mobileLabel: period2Label,
      cell: (metric) => (
        <Money
          value={metric.period2Value}
          formatter={(value) => formatValue(value, metric.format)}
          className="text-app-purple"
        />
      ),
    },
    {
      key: 'changePercent',
      header: 'Change',
      align: 'right',
      mobileLabel: 'Change',
      cell: (metric) => (
        <ChangeDisplay
          changePercent={metric.changePercent}
          isExpense={metric.isExpense}
        />
      ),
    },
  ]
}

export default function PeriodComparison() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()
  const [compareMode, setCompareMode] = useState<CompareMode>('months')
  const [selectedMonth1, setSelectedMonth1] = useState<string | null>(null)
  const [selectedMonth2, setSelectedMonth2] = useState<string | null>(null)
  const [selectedYear1, setSelectedYear1] = useState<number | null>(null)
  const [selectedYear2, setSelectedYear2] = useState<number | null>(null)

  const availableMonths = useMemo(() => deriveAvailableMonths(monthlyData), [monthlyData])

  const availableYears = useMemo(() => deriveAvailableYears(monthlyData), [monthlyData])

  const effectiveMonth1 = selectedMonth1 ?? availableMonths[0]?.month ?? null
  const effectiveMonth2 = selectedMonth2 ?? availableMonths[1]?.month ?? null
  const effectiveYear1 = selectedYear1 ?? availableYears[0] ?? null
  const effectiveYear2 = selectedYear2 ?? availableYears[1] ?? null

  const yearlyData = useMemo(() => deriveYearlyData(monthlyData), [monthlyData])

  const transactionCounts = useMemo(() => deriveTransactionCounts(monthlyData), [monthlyData])

  const getTransactionCount = useMemo(
    () => makeGetTransactionCount(transactionCounts),
    [transactionCounts],
  )

  const comparisonMetrics = useMemo(
    () =>
      buildComparisonMetrics({
        compareMode,
        monthlyData,
        availableMonths,
        yearlyData,
        effectiveMonth1,
        effectiveMonth2,
        effectiveYear1,
        effectiveYear2,
        getTransactionCount,
      }),
    [
      compareMode,
      effectiveMonth1,
      effectiveMonth2,
      effectiveYear1,
      effectiveYear2,
      monthlyData,
      availableMonths,
      yearlyData,
      getTransactionCount,
    ],
  )

  const period1Label =
    compareMode === 'months' && effectiveMonth1
      ? formatMonthLabel(effectiveMonth1)
      : (effectiveYear1?.toString() ?? '')
  const period2Label =
    compareMode === 'months' && effectiveMonth2
      ? formatMonthLabel(effectiveMonth2)
      : (effectiveYear2?.toString() ?? '')
  const comparisonColumns = buildComparisonColumns(period1Label, period2Label)

  if (isLoading) {
    return (
      <div className="ledger-panel p-4 sm:p-5">
        <div className="h-8 skeleton w-1/3 mb-4" />
        <div className="h-64 skeleton" />
      </div>
    )
  }

  if (availableMonths.length < 2) {
    return (
      <div className="ledger-panel p-4 sm:p-5">
        <h3 className="mb-2 text-base font-semibold">Period comparison</h3>
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
      className="ledger-panel p-4 sm:p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-md"
            style={{
              backgroundColor: `${rawColors.app.indigo}26`,
            }}
          >
            <Zap
              className="size-4"
              style={{ color: rawColors.app.indigo }}
              aria-hidden
            />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Quick comparison</h3>
            <p className="text-xs" style={{ color: rawColors.text.secondary }}>
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
        <DataTable<MetricRow>
          columns={comparisonColumns}
          rows={comparisonMetrics}
          rowKey={(metric) => metric.label}
          ariaLabel={`${period1Label} and ${period2Label} financial metrics comparison`}
          mobileCards
        />
      ) : (
        <div className="text-center py-8" style={{ color: rawColors.text.secondary }}>
          <p>Unable to calculate comparisons. Please select different periods.</p>
        </div>
      )}

      {comparisonMetrics && comparisonMetrics.length > 0 && (
        <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-md border border-[var(--hairline-1)] md:grid-cols-4">
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
