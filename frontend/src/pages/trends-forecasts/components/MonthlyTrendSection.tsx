import { useCallback, useMemo, useState } from 'react'

import { motion } from 'motion/react'
import { LineChart as LineChartIcon } from 'lucide-react'

import ChartBrush from '@/components/charts/ChartBrush'
import EmptyState from '@/components/shared/EmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import { useChartRange } from '@/components/ui/useChartRange'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatChartPeriod } from '@/lib/chartDateLabels'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'

import type { useTrendsForecasts } from '../useTrendsForecasts'
import MonthlyTrendPanel, { type ActiveMonth, type TrendKey, type TrendPanelSpec } from './MonthlyTrendPanel'

type MonthlyTrendData = ReturnType<typeof useTrendsForecasts>['monthlyTrendWithAvg']

interface MonthlyTrendSectionProps {
  readonly isLoading: boolean
  readonly data: MonthlyTrendData
  readonly peakIncome: number
  readonly peakExpenses: number
  readonly peakSavings: number
  readonly rollingAvgMonths: number
}

export default function MonthlyTrendSection({
  isLoading,
  data,
  peakIncome,
  peakExpenses,
  peakSavings,
  rollingAvgMonths,
}: MonthlyTrendSectionProps) {
  const range = useChartRange(data.map((row) => row.month))
  const { startIndex, endIndex } = range
  // One object per zoom, so inspecting a month re-renders the panels without rebuilding their scales.
  const visibleRange = useMemo(() => ({ startIndex, endIndex }), [startIndex, endIndex])
  // The panels inspect one month together: each draws the crosshair, the touched one the tooltip.
  const [active, setActive] = useState<ActiveMonth | null>(null)
  const onActiveChange = useCallback((panel: TrendKey, index: number | null) => {
    setActive((current) => {
      // A panel the pointer left, or that lost focus, clears only its own inspection.
      if (index === null) return current?.panel === panel ? null : current
      return current?.panel === panel && current.index === index ? current : { index, panel }
    })
  }, [])
  const app = usePaletteSnapshot(rawColors.app)
  const text = usePaletteSnapshot(rawColors.text)
  const brushValues = useMemo(() => data.map((row) => row.savings), [data])
  const panels: readonly TrendPanelSpec[] = [
    { dataKey: 'income', avgKey: 'incomeAvg', label: 'Income', color: app.green, peak: peakIncome },
    { dataKey: 'expenses', avgKey: 'expensesAvg', label: 'Expenses', color: app.red, peak: peakExpenses },
    { dataKey: 'savings', avgKey: 'savingsAvg', label: 'Savings', color: app.blue, peak: peakSavings },
  ]

  return (
    <motion.section
      {...SCROLL_FADE_UP}
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="income-expense-trends-title"
    >
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-app-blue">
            <LineChartIcon className="size-4 shrink-0" aria-hidden="true" />
            <p className="ledger-meta">Your monthly trajectory</p>
          </div>
          <h2
            id="income-expense-trends-title"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            Income & Expense Trends
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly breakdown with {rollingAvgMonths}-month rolling averages
          </p>
        </div>
        {data.length > 0 && (
          <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {formatChartPeriod(data[0].month)} to {formatChartPeriod(data.at(-1)!.month)}
          </p>
        )}
      </div>

      {isLoading && <ChartSkeleton height="h-80" />}
      {!isLoading && data.length > 6 && <ChartRangeControls range={range} label="Monthly trends chart range" />}
      {!isLoading && data.length > 0 && (
        <>
          <div className="divide-y divide-border">
            {panels.map((spec, order) => (
              <MonthlyTrendPanel
                key={spec.dataKey}
                spec={spec}
                order={order}
                data={data}
                visibleRange={visibleRange}
                rollingAvgMonths={rollingAvgMonths}
                averageColor={text.secondary}
                active={active}
                onActiveChange={onActiveChange}
              />
            ))}
          </div>
          {/* One brush zooms all three panels; it lines up with their plot column. */}
          {data.length > 6 && (
            <div className="grid min-w-0 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-6">
              <div className="min-w-0 lg:col-start-2">
                <ChartBrush range={range} values={brushValues} ariaLabel="Monthly trends zoom" />
              </div>
            </div>
          )}
        </>
      )}
      {!isLoading && data.length > 0 && (
        <p className="mt-5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          Each plot uses its own amount scale. Dotted horizontal lines mark peak months; the savings plot also marks break-even.
        </p>
      )}
      {!isLoading && data.length === 0 && (
        <EmptyState
          icon={LineChartIcon}
          title="No data available"
          description="Upload your transaction data to see spending trends and forecasts."
          actionLabel="Upload Data"
          actionHref="/upload"
          variant="chart"
        />
      )}
    </motion.section>
  )
}
