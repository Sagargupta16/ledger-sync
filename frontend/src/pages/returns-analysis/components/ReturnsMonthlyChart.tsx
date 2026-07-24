import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import {
  Bar,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  ACTIVE_DOT,
  BRUSH_DEFAULTS,
  ChartContainer,
  GRID_DEFAULTS,
  chartTooltipProps,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from '@/components/ui/ChartTooltip'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

export interface MonthlyComboDatum {
  readonly month: string
  readonly income: number
  readonly expenses: number
  readonly net: number
  readonly cumulative: number
}

const COMBO_SERIES_LABELS: Record<string, string> = {
  income: 'Income',
  expenses: 'Expenses',
  net: 'Net',
  cumulative: 'Cumulative',
}

function ComboTooltip({
  active,
  payload,
  label,
}: Readonly<{
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number; color?: string }>
  label?: string
}>) {
  if (!active || !payload?.length) return null

  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p style={{ ...CHART_TOOLTIP_LABEL_STYLE, fontSize: 12, marginBottom: 6 }}>{label}</p>
      {payload.map((item) => (
        <div
          key={item.dataKey ?? item.color}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: item.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: rawColors.chart.textSubtle, fontSize: 11 }}>
            {COMBO_SERIES_LABELS[item.dataKey ?? ''] ?? item.dataKey}
          </span>
          <span
            style={{
              color: rawColors.chart.textPrimary,
              fontSize: 12,
              fontWeight: 600,
              marginLeft: 'auto',
            }}
          >
            {formatCurrency(item.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ReturnsMonthlyChart({
  data,
}: Readonly<{ data: readonly MonthlyComboDatum[] }>) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass rounded-2xl p-4 sm:p-6"
      aria-labelledby="monthly-returns-title"
    >
      <div className="mb-6 flex items-center gap-3">
        <Activity className="size-5 text-app-blue" aria-hidden="true" />
        <div>
          <h2 id="monthly-returns-title" className="text-lg font-semibold text-foreground">
            Monthly Investment P&amp;L
          </h2>
          <p className="text-pretty text-xs text-text-tertiary">
            Bars show monthly net, line shows cumulative growth
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <ChartEmptyState height={360} />
      ) : (
        <ChartContainer
          height={360}
          ariaLabel="Combo chart of monthly investment net profit or loss with a cumulative growth line."
        >
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis {...xAxisDefaults(data.length)} dataKey="month" />
            <YAxis {...yAxisDefaults()} />
            <Tooltip content={ComboTooltip as never} cursor={chartTooltipProps.cursor} />
            <ReferenceLine y={0} stroke={rawColors.chart.referenceLine} />
            <Bar
              dataKey="net"
              name="net"
              radius={[3, 3, 0, 0]}
              isAnimationActive={shouldAnimate(data.length)}
              animationDuration={600}
              animationEasing="ease-out"
            >
              {data.map((datum) => (
                <Cell
                  key={datum.month}
                  fill={datum.net >= 0 ? rawColors.app.green : rawColors.app.red}
                />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="cumulative"
              name="Cumulative"
              stroke={rawColors.app.blue}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={data.length === 1 ? { r: 3, fill: rawColors.app.blue } : false}
              activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
              isAnimationActive={shouldAnimate(data.length)}
              animationDuration={600}
            />
            {data.length > 6 && (
              <Brush
                {...BRUSH_DEFAULTS}
                dataKey="month"
                startIndex={Math.max(0, data.length - Math.ceil(data.length / 3))}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      )}
    </motion.section>
  )
}
