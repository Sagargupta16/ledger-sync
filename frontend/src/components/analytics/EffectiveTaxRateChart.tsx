import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { CHART_AXIS_COLOR } from '@/constants/chartColors'
import { chartTooltipProps } from '@/components/ui'
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
      className="glass rounded-2xl border border-border p-4 md:p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-ios-orange/20 rounded-xl">
            <TrendingUp className="w-5 h-5 text-ios-orange" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Effective Tax Rate — New vs Old Regime</h3>
            <p className="text-xs text-muted-foreground">
              Compare both regimes side-by-side (without deductions for Old Regime)
            </p>
          </div>
        </div>
      </div>

      <div style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <defs>
              <linearGradient id="newRegimeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={rawColors.ios.orange} stopOpacity={0.25} />
                <stop offset="95%" stopColor={rawColors.ios.orange} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="oldRegimeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={rawColors.ios.blue} stopOpacity={0.15} />
                <stop offset="95%" stopColor={rawColors.ios.blue} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="income"
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 10 }}
              tickFormatter={(v: number) => formatCurrencyShort(v)}
            />
            <YAxis
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 10 }}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 'auto']}
            />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number, name: string) => [
                `${value.toFixed(2)}%`,
                name === 'newRegimeRate' ? 'New Regime' : 'Old Regime',
              ]}
              labelFormatter={(label: number) => `Income: ${formatCurrencyShort(label)}`}
            />
            {/* Old Regime — blue dashed */}
            <Area
              type="monotone"
              dataKey="oldRegimeRate"
              stroke={rawColors.ios.blue}
              fill="url(#oldRegimeGrad)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              name="oldRegimeRate"
            />
            {/* New Regime — orange solid */}
            <Area
              type="monotone"
              dataKey="newRegimeRate"
              stroke={rawColors.ios.orange}
              fill="url(#newRegimeGrad)"
              strokeWidth={2}
              name="newRegimeRate"
            />
            {/* Crossover marker */}
            {crossoverIncome && crossoverIncome <= maxIncome && (
              <ReferenceLine
                x={crossoverIncome}
                stroke={rawColors.ios.purple}
                strokeDasharray="4 4"
                label={{
                  value: `Old wins at ${formatCurrencyShort(crossoverIncome)}`,
                  fill: rawColors.ios.purple,
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
                  stroke={rawColors.ios.green}
                  strokeDasharray="3 3"
                  label={{
                    value: 'You',
                    fill: rawColors.ios.green,
                    fontSize: 11,
                    position: 'top',
                  }}
                />
                <ReferenceDot
                  x={currentPoint.income}
                  y={currentPoint.effectiveRate}
                  r={5}
                  fill={rawColors.ios.green}
                  stroke="#000"
                  strokeWidth={2}
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend + Range selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded" style={{ backgroundColor: rawColors.ios.orange }} />
            <span>New Regime</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded border-dashed border-t-2" style={{ borderColor: rawColors.ios.blue }} />
            <span>Old Regime</span>
          </div>
          {crossoverIncome && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rawColors.ios.purple }} />
              <span>Crossover</span>
            </div>
          )}
          {currentPoint && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rawColors.ios.green }} />
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
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  maxIncome === value
                    ? 'bg-ios-orange/20 text-ios-orange'
                    : 'bg-white/5 text-muted-foreground hover:bg-white/10'
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
