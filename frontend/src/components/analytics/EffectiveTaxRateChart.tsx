import { useState, useMemo } from 'react'
import { motion } from 'motion/react'
import { TrendingUp } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts'
import { calculateTax, getStandardDeduction, getTaxSlabs } from '@/lib/taxCalculator'
import type { TaxSlab } from '@/lib/taxCalculator'
import { formatCurrencyShort } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { CHART_LINE_CURSOR_STYLE } from '@/components/ui/ChartTooltip'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, ACTIVE_DOT } from '@/components/ui/chartDefaults'
import { fadeUpItem } from '@/constants/animations'

interface EffectiveTaxRateChartProps {
  taxSlabs?: TaxSlab[]
  isNewRegime?: boolean
  fyYear: number
  currentIncome?: number
}

const RANGE_OPTIONS = [
  { label: '50L', value: 5000000 },
  { label: '1Cr', value: 10000000 },
  { label: '2Cr', value: 20000000 },
  { label: '5Cr', value: 50000000 },
  { label: '10Cr', value: 100000000 },
]

export default function EffectiveTaxRateChart({
  fyYear,
  isNewRegime = true,
  currentIncome = 0,
}: Readonly<EffectiveTaxRateChartProps>) {
  const [maxIncome, setMaxIncome] = useState(5000000)
  const { animate, isMobile } = useChartPresentation(101)

  // Compute BOTH regime curves for side-by-side comparison
  const chartData = useMemo(() => {
    const points = 100
    const step = maxIncome / points
    const newSlabs = getTaxSlabs(fyYear, 'new')
    const oldSlabs = getTaxSlabs(fyYear, 'old')
    const newDeduction = getStandardDeduction(fyYear, 'new')
    const oldDeduction = getStandardDeduction(fyYear, 'old')

    const data: Array<{
      income: number
      newRegimeRate: number
      oldRegimeRate: number
    }> = []

    for (let i = 0; i <= points; i++) {
      const income = Math.round(step * i)
      if (income === 0) {
        data.push({ income: 0, newRegimeRate: 0, oldRegimeRate: 0 })
        continue
      }

      const newResult = calculateTax(
        income, newSlabs, newDeduction, false, 12, true, fyYear,
      )
      const oldResult = calculateTax(
        income, oldSlabs, oldDeduction, false, 12, false, fyYear,
      )

      data.push({
        income,
        newRegimeRate: Math.round(((newResult.totalTax / income) * 100) * 100) / 100,
        oldRegimeRate: Math.round(((oldResult.totalTax / income) * 100) * 100) / 100,
      })
    }

    return data
  }, [maxIncome, fyYear])

  // Find crossover point where old regime becomes better
  const crossoverIncome = useMemo(() => {
    for (const point of chartData) {
      if (point.income > 0 && point.oldRegimeRate < point.newRegimeRate) {
        return point.income
      }
    }
    return null
  }, [chartData])

  const currentPoint = useMemo(() => {
    if (currentIncome <= 0) return null
    const regime = isNewRegime ? 'new' : 'old'
    const slabs = getTaxSlabs(fyYear, regime)
    const result = calculateTax(
      currentIncome, slabs, getStandardDeduction(fyYear, regime), false, 12, isNewRegime, fyYear,
    )
    return {
      income: currentIncome,
      effectiveRate: Math.round(((result.totalTax / currentIncome) * 100) * 100) / 100,
    }
  }, [currentIncome, fyYear, isNewRegime])

  return (
    <motion.div
      variants={fadeUpItem}
      className="ledger-panel p-4 sm:p-5"
    >
      <div className="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-lg">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-base font-semibold">Effective tax rate</h3>
            <TrendingUp aria-hidden="true" className="size-4 shrink-0 text-app-orange" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Includes each regime's standard deduction, before additional deductions
          </p>
          {fyYear !== 0 && (
            <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              FY {fyYear}-{String(fyYear + 1).slice(-2)}
            </p>
          )}
        </div>
        {fyYear !== 0 && currentPoint && (
          <div className="min-w-0">
            <p className="ledger-meta text-muted-foreground">Your effective rate</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {currentPoint.effectiveRate.toFixed(2)}<span className="ml-1 text-sm text-muted-foreground">%</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isNewRegime ? 'New' : 'Old'} regime at {formatCurrencyShort(currentPoint.income)}
            </p>
          </div>
        )}
      </div>

        {fyYear === 0 ? (
          <ChartEmptyState height={320} message="Select a financial year to view effective tax rates" />
        ) : (
        <ChartContainer height={320} mobileHeight={260} ariaLabel="Effective tax rate by income for the new and old regimes, with regime-crossover and your-income markers">
          <LineChart data={chartData} margin={{ top: 24, right: isMobile ? 8 : 16, bottom: 8, left: 0 }}>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis
              {...xAxisDefaults(chartData.length)}
              dataKey="income"
              // Continuous (numeric) scale so the "You" ReferenceLine/Dot at an
              // arbitrary income (currentIncome) interpolates between the 101
              // evenly-spaced points instead of vanishing -- a category scale
              // only positions reference marks at exact data values.
              type="number"
              domain={[0, maxIncome]}
              interval="preserveStartEnd"
              tickFormatter={(v: number) => formatCurrencyShort(v)}
            />
            <YAxis
              {...yAxisDefaults({ currency: false, width: isMobile ? 36 : 44 })}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 'auto']}
            />
            <Tooltip
              {...chartTooltipProps}
              cursor={CHART_LINE_CURSOR_STYLE}
              content={<ChartTooltipContent />}
              formatter={(value, name) => [
                typeof value === 'number' ? `${value.toFixed(2)}%` : '',
                name === 'newRegimeRate' ? 'New Regime' : 'Old Regime',
              ]}
              labelFormatter={(label: unknown) => `Income: ${formatCurrencyShort(Number(label))}`}
            />
            {/* Old Regime -- blue dashed line (no fill, so the crossover with
                the New Regime curve stays crisp instead of blurring under two
                translucent area gradients) */}
            <Line
              type="monotone"
              dataKey="oldRegimeRate"
              stroke={rawColors.app.blue}
              strokeWidth={2.25}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
              name="oldRegimeRate"
              animationDuration={520}
              animationEasing="ease-out"
              isAnimationActive={animate}
            />
            {/* New Regime -- orange solid line */}
            <Line
              type="monotone"
              dataKey="newRegimeRate"
              stroke={rawColors.app.orange}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.orange }}
              name="newRegimeRate"
              animationDuration={520}
              animationEasing="ease-out"
              isAnimationActive={animate}
            />
            {/* Crossover marker */}
            {crossoverIncome && crossoverIncome <= maxIncome && (
              <ReferenceLine
                x={crossoverIncome}
                stroke={rawColors.app.purple}
                strokeDasharray="4 4"
                label={{
                  value: `Old lower near ${formatCurrencyShort(crossoverIncome)}`,
                  fill: rawColors.app.purple,
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
            )}
            {/* User's current income marker */}
            {currentPoint && currentPoint.income <= maxIncome && (
              <>
                <ReferenceLine
                  x={currentPoint.income}
                  stroke={rawColors.app.green}
                  strokeDasharray="3 3"
                  label={{
                    value: 'You',
                    fill: rawColors.app.green,
                    fontSize: 11,
                    position: 'top',
                  }}
                />
                <ReferenceDot
                  x={currentPoint.income}
                  y={currentPoint.effectiveRate}
                  r={5}
                  fill={rawColors.app.green}
                  stroke={rawColors.chart.activeStroke}
                  strokeWidth={2}
                />
              </>
            )}
          </LineChart>
        </ChartContainer>
        )}

      {/* Legend + Range selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:w-auto">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded" style={{ backgroundColor: rawColors.app.orange }} />
            <span>New Regime</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded border-dashed border-t-2" style={{ borderColor: rawColors.app.blue }} />
            <span>Old Regime</span>
          </div>
          {crossoverIncome && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rawColors.app.purple }} />
              <span>Crossover</span>
            </div>
          )}
          {currentPoint && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rawColors.app.green }} />
              <span>You, {isNewRegime ? 'new' : 'old'} ({currentPoint.effectiveRate}%)</span>
            </div>
          )}
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-xs text-muted-foreground">Income range</legend>
          <div className="ledger-control flex flex-wrap rounded-md border p-1">
            {RANGE_OPTIONS.map(({ label, value }) => (
              <motion.button
                key={value}
                type="button"
                onClick={() => setMaxIncome(value)}
                aria-pressed={maxIncome === value}
                aria-label={`Income up to ${formatCurrencyShort(value)}`}
                whileTap={animate ? { scale: 0.94 } : undefined}
                transition={{ duration: 0.15 }}
                className={`min-h-11 min-w-11 rounded px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:pointer-fine:min-h-8 lg:pointer-fine:min-w-0 ${
                  maxIncome === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </fieldset>
      </div>
      {fyYear !== 0 && chartDataTable(
        chartData,
        [
          { header: 'Annual income', rowHeader: true, value: (row) => formatCurrencyShort(row.income) },
          { header: 'New regime effective rate', value: (row) => `${row.newRegimeRate.toFixed(2)}%` },
          { header: 'Old regime effective rate', value: (row) => `${row.oldRegimeRate.toFixed(2)}%` },
        ],
        `Effective tax rates for financial year ${fyYear}-${String(fyYear + 1).slice(-2)}`,
        (row) => String(row.income),
      )}
    </motion.div>
  )
}
