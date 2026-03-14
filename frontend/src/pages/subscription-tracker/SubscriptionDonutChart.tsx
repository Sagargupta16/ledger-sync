import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { DollarSign } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { ChartContainer, chartTooltipProps, shouldAnimate } from '@/components/ui'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { getChartColor } from '@/constants/chartColors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import type { ManualSubscription } from './types'
import { getAnnualFactor } from './helpers'

interface SubscriptionDonutChartProps {
  confirmedDetected: RecurringTransaction[]
  manualSubs: ManualSubscription[]
}

export function SubscriptionDonutChart({
  confirmedDetected,
  manualSubs,
}: Readonly<SubscriptionDonutChartProps>) {
  const donutData = useMemo(() => {
    const detected = confirmedDetected.map((sub, i) => ({
      name: sub.name,
      value: Math.abs(sub.expected_amount) * getAnnualFactor(sub.frequency),
      color: getChartColor(i),
    }))
    const manual = manualSubs.map((sub, i) => ({
      name: sub.name,
      value: Math.abs(sub.amount) * getAnnualFactor(sub.frequency),
      color: getChartColor(confirmedDetected.length + i),
    }))
    return [...detected, ...manual].filter((d) => d.value > 0)
  }, [confirmedDetected, manualSubs])

  const totalAnnual = useMemo(
    () => donutData.reduce((s, d) => s + d.value, 0),
    [donutData],
  )

  if (donutData.length === 0) return null

  return (
    <motion.div className="glass rounded-2xl border border-border p-4 md:p-6 shadow-xl" {...SCROLL_FADE_UP}>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="p-2.5 rounded-xl"
          style={{ backgroundColor: `${rawColors.ios.orange}1a`, boxShadow: `0 4px 12px ${rawColors.ios.orange}20` }}
        >
          <DollarSign className="w-5 h-5 text-ios-orange" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Annual Subscription Costs</h3>
          <p className="text-xs text-muted-foreground">
            Total projected annual spend across {donutData.length} subscription{donutData.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
        {/* Donut Chart */}
        <div className="flex justify-center">
          <div style={{ width: 280, height: 280 }}>
            <ChartContainer>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                  strokeWidth={0}
                  dataKey="value"
                  isAnimationActive={shouldAnimate(donutData.length)}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {donutData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(v: number | undefined) => v === undefined ? '' : formatCurrency(v)}
                />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-8" fill="#fafafa" fontSize="18" fontWeight="700">
                    {formatCurrencyCompact(totalAnnual)}
                  </tspan>
                  <tspan x="50%" dy="22" fill="#71717a" fontSize="11">
                    per year
                  </tspan>
                </text>
              </PieChart>
            </ChartContainer>
          </div>
        </div>
        {/* Legend */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {[...donutData]
            .sort((a: { value: number }, b: { value: number }) => b.value - a.value)
            .map((d: { name: string; value: number; color: string }) => (
              <div key={d.name} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-sm text-foreground truncate">{d.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-medium text-white">{formatCurrency(d.value)}</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {totalAnnual > 0 ? ((d.value / totalAnnual) * 100).toFixed(1) : '0'}%
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </motion.div>
  )
}
