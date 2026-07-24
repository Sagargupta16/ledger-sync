import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
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
import { calculateTax, getTaxSlabs } from '@/lib/taxCalculator'
import type { TaxSlab } from '@/lib/taxCalculator'
import { formatCurrencyShort } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate } from '@/components/ui/chartDefaults'
import { fadeUpItem } from '@/constants/animations'

interface EffectiveTaxRateChartProps {
  taxSlabs?: TaxSlab[]
  isNewRegime?: boolean
  fyYear: number
  standardDeduction: number
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
  standardDeduction,
  currentIncome = 0,
}: Readonly<EffectiveTaxRateChartProps>) {
  const [maxIncome, setMaxIncome] = useState(5000000)

  // Compute BOTH regime curves for side-by-side comparison
  const chartData = useMemo(() => {
    const points = 100
    const step = maxIncome / points
    const newSlabs = getTaxSlabs(fyYear, 'new')
    const oldSlabs = getTaxSlabs(fyYear, 'old')

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
        income, newSlabs, standardDeduction, false, 12, true, fyYear,
      )
      const oldResult = calculateTax(
        income, oldSlabs, standardDeduction, false, 12, false, fyYear,
      )

      data.push({
        income,
        newRegimeRate: Math.round(((newResult.totalTax / income) * 100) * 100) / 100,
        oldRegimeRate: Math.round(((oldResult.totalTax / income) * 100) * 100) / 100,
      })
    }

    return data
  }, [maxIncome, fyYear, standardDeduction])

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
    const newSlabs = getTaxSlabs(fyYear, 'new')
    const result = calculateTax(
      currentIncome, newSlabs, standardDeduction, false, 12, true, fyYear,
    )
    return {
      income: currentIncome,
      effectiveRate: Math.round(((result.totalTax / currentIncome) * 100) * 100) / 100,
    }
  }, [currentIncome, fyYear, standardDeduction])

  return (
    <motion.div
      variants={fadeUpItem}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-app-orange/20 rounded-xl">
            <TrendingUp className="w-5 h-5 text-app-orange" />
          </div>
          <div>
      <h3 className="text-lg font-semibold">Effective Tax Rate - New vs Old Regime</h3>
            <p className="text-xs text-muted-foreground">
              Compare both regimes side-by-side (without deductions for Old Regime)
            </p>
          </div>
        </div>
      </div>

      <div style={{ height: 350 }}>
        {fyYear === 0 ? (
          <ChartEmptyState height={350} message="Select a financial year to view effective tax rates" />
        ) : (
        <ChartContainer ariaLabel="Effective tax rate by income for the new and old regimes, with regime-crossover and your-income markers">
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
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
              {...yAxisDefaults({ currency: false })}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 'auto']}
            />
            <Tooltip
              {...chartTooltipProps}
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
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              name="oldRegimeRate"
              animationDuration={600}
              animationEasing="ease-out"
              isAnimationActive={shouldAnimate(chartData.length)}
            />
            {/* New Regime -- orange solid line */}
            <Line
              type="monotone"
              dataKey="newRegimeRate"
              stroke={rawColors.app.orange}
              strokeWidth={2}
              dot={false}
              name="newRegimeRate"
              animationDuration={600}
              animationEasing="ease-out"
              isAnimationActive={shouldAnimate(chartData.length)}
            />
            {/* Crossover marker */}
            {crossoverIncome && crossoverIncome <= maxIncome && (
              <ReferenceLine
                x={crossoverIncome}
                stroke={rawColors.app.purple}
                strokeDasharray="4 4"
                label={{
                  value: `Old wins at ${formatCurrencyShort(crossoverIncome)}`,
                  fill: rawColors.app.purple,
                  fontSize: 10,
                  position: 'top',
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
      </div>

      {/* Legend + Range selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
              <span>You ({currentPoint.effectiveRate}%)</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Range:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {RANGE_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMaxIncome(value)}
                aria-pressed={maxIncome === value}
                className={`min-h-11 px-2.5 py-1 text-xs font-medium transition-colors sm:min-h-8 ${
                  maxIncome === value
                    ? 'bg-app-orange/20 text-app-orange'
                    : 'bg-[var(--overlay-2)] text-muted-foreground hover:bg-[var(--overlay-5)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
