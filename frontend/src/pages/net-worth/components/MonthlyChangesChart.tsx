import { useCallback } from 'react'

import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  ChartContainer,
  GRID_DEFAULTS,
  chartTooltipProps,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { CHART_TOOLTIP_STYLE } from '@/components/ui/ChartTooltip'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

interface MonthlyChange {
  month: string
  change: number
  base: number
  increase: number
  decrease: number
  endValue: number
}

interface MonthlyChangesChartProps {
  monthlyChanges: MonthlyChange[]
}

export function MonthlyChangesChart({ monthlyChanges }: Readonly<MonthlyChangesChartProps>) {
  const renderWaterfallTooltip = useCallback(
    ({
      active,
      payload,
      label,
    }: {
      active?: boolean
      payload?: Array<{ payload?: { change: number; endValue: number } }>
      label?: string
    }) => {
      if (!active || !payload?.length) return null
      const item = payload[0]?.payload
      if (!item) return null
      const isPositive = item.change >= 0
      return (
        <div style={CHART_TOOLTIP_STYLE}>
          <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '6px' }}>{label}</p>
          <p
            style={{
              color: isPositive ? rawColors.app.green : rawColors.app.red,
              fontSize: '16px',
              fontWeight: 700,
            }}
          >
            {isPositive ? '+' : ''}
            {formatCurrency(item.change)}
          </p>
          <p style={{ color: '#71717a', fontSize: '11px', marginTop: '4px' }}>
            Net Worth: {formatCurrency(item.endValue)}
          </p>
        </div>
      )
    },
    [],
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-app-purple" />
          <h3 className="text-lg font-semibold text-white">Monthly Net Worth Changes</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: rawColors.app.green }} />
            <span className="text-muted-foreground">Increase</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: rawColors.app.red }} />
            <span className="text-muted-foreground">Decrease</span>
          </span>
        </div>
      </div>
      {monthlyChanges.length === 0 ? (
        <ChartEmptyState height={320} />
      ) : (
        <ChartContainer height={320}>
          <BarChart data={monthlyChanges} barCategoryGap="20%">
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis {...xAxisDefaults(monthlyChanges.length)} dataKey="month" />
            <YAxis {...yAxisDefaults()} />
            <Tooltip {...chartTooltipProps} content={renderWaterfallTooltip as never} />
            <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="increase"
              stackId="waterfall"
              name="Increase"
              fill={rawColors.app.green}
              fillOpacity={0.85}
              radius={[4, 4, 4, 4]}
              isAnimationActive={shouldAnimate(monthlyChanges.length)}
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="decrease"
              stackId="waterfall"
              name="Decrease"
              fill={rawColors.app.red}
              fillOpacity={0.85}
              radius={[4, 4, 4, 4]}
              isAnimationActive={shouldAnimate(monthlyChanges.length)}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </BarChart>
        </ChartContainer>
      )}
    </motion.div>
  )
}
