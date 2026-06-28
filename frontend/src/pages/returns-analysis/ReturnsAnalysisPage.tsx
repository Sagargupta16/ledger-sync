import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Banknote, Receipt, Activity } from 'lucide-react'
import {
  XAxis, YAxis,
  CartesianGrid, Tooltip, Line, ReferenceLine,
  BarChart, Bar, Cell, Brush, ComposedChart,
} from 'recharts'

import { rawColors } from '@/constants/colors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import {
  PageHeader, ChartContainer,
  BRUSH_DEFAULTS,
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults,
  shouldAnimate, ACTIVE_DOT, chartTooltipProps,
} from '@/components/ui'
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_LABEL_STYLE } from '@/components/ui/ChartTooltip'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'

import { useReturnsAnalysis } from './useReturnsAnalysis'

// ─── Component ──────────────────────────────────────────────────────────────

function AccountTooltip({
  active,
  payload,
}: Readonly<{
  active?: boolean
  payload?: Array<{ payload: { name: string; value: number; transactions: number } }>
}>) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p style={{ ...CHART_TOOLTIP_LABEL_STYLE, marginBottom: 6 }}>{p.name}</p>
      <div style={{ color: '#fafafa', fontSize: 14, fontWeight: 600 }}>{formatCurrency(p.value)}</div>
      <div style={{ color: '#71717a', fontSize: 11, marginTop: 2 }}>{p.transactions} transaction{p.transactions === 1 ? '' : 's'}</div>
    </div>
  )
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
      {payload.map((p) => (
        <div key={p.dataKey ?? p.color} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: '#71717a', fontSize: 11 }}>{COMBO_SERIES_LABELS[p.dataKey ?? ''] ?? p.dataKey}</span>
          <span style={{ color: '#fafafa', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}>{formatCurrency(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

export default function ReturnsAnalysisPage() {
  const {
    isLoading,
    timeFilterProps,
    investmentAccounts,
    dividendIncome, brokerFees, interestIncome, investmentProfit, investmentLoss, netProfitLoss,
    totalIncome, totalExpenses,
    estimatedCAGR, roi,
    monthlyComboData,
  } = useReturnsAnalysis()

  // Account names on the Holdings y-axis need room to read, but a fixed 140px
  // width eats the plot area on phones -- shrink it on mobile.
  const { breakpoint } = useChartDimensions()
  const holdingsAxisWidth = breakpoint === 'mobile' ? 84 : 140

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Returns Analysis"
          subtitle="Analyze your investment returns over time"
          action={<AnalyticsTimeFilter {...timeFilterProps} />}
        />

        {/* ── Hero Section: Big Net P&L + Composition Donut ── */}
        <div>
          {/* Hero metric + quick stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-4 sm:p-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className={`p-4 rounded-2xl shrink-0 ${netProfitLoss >= 0 ? 'bg-app-green/10' : 'bg-app-red/10'}`}>
                {netProfitLoss >= 0
                  ? <TrendingUp className="w-8 h-8 text-app-green" />
                  : <TrendingDown className="w-8 h-8 text-app-red" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-text-tertiary">Net Investment P&L</p>
                <p className={`text-3xl sm:text-4xl font-bold tracking-tight truncate ${netProfitLoss >= 0 ? 'text-app-green' : 'text-app-red'}`}>
                  {netProfitLoss >= 0 ? '+' : ''}{formatCurrency(netProfitLoss)}
                </p>
              </div>
            </div>
            {/* Quick stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'CAGR', value: isLoading ? '...' : formatPercent(estimatedCAGR), color: estimatedCAGR >= 0 ? 'text-app-green' : 'text-app-red' },
                { label: 'Monthly ROI', value: isLoading ? '...' : formatPercent(roi), color: roi >= 0 ? 'text-app-green' : 'text-app-red' },
                { label: 'Total Income', value: formatCurrencyShort(totalIncome), color: 'text-app-green' },
                { label: 'Total Costs', value: formatCurrencyShort(totalExpenses), color: 'text-app-red' },
              ].map(stat => (
                <div key={stat.label} className="bg-[var(--overlay-2)] border border-border rounded-lg p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-quaternary">{stat.label}</p>
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── Monthly P&L Combo Chart: Bars + Cumulative Line ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-4 sm:p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-5 h-5 text-app-blue" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Monthly Investment P&L</h3>
              <p className="text-xs text-text-tertiary">Bars show monthly net, line shows cumulative growth</p>
            </div>
          </div>
          {monthlyComboData.length === 0 ? (
            <ChartEmptyState height={360} />
          ) : (
            <ChartContainer
              height={360}
              ariaLabel="Combo chart of monthly investment net profit or loss with a cumulative growth line."
            >
              <ComposedChart
                data={monthlyComboData}
                margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
              >
                <CartesianGrid {...GRID_DEFAULTS} />
                <XAxis {...xAxisDefaults(monthlyComboData.length)} dataKey="month" />
                <YAxis {...yAxisDefaults()} />
                <Tooltip content={ComboTooltip as never} cursor={chartTooltipProps.cursor} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                {/* Single signed bar per month -- green above zero, red below.
                    A bar's baseline-anchored length encodes the monthly net far
                    more accurately than a split area fill did. */}
                <Bar
                  dataKey="net"
                  name="net"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={shouldAnimate(monthlyComboData.length)}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {monthlyComboData.map((d) => (
                    <Cell
                      key={d.month}
                      fill={d.net >= 0 ? rawColors.app.green : rawColors.app.red}
                    />
                  ))}
                </Bar>
                {/* Cumulative line overlay */}
                <Line
                  type="monotone" dataKey="cumulative" name="Cumulative"
                  stroke={rawColors.app.blue} strokeWidth={2} strokeDasharray="6 3"
                  dot={monthlyComboData.length === 1 ? { r: 3, fill: rawColors.app.blue } : false} activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                  isAnimationActive={shouldAnimate(monthlyComboData.length)}
                  animationDuration={600}
                />
                {/* Drag-to-zoom across the timeline; default window is the
                    most-recent third so the chart reads at full fidelity. */}
                {monthlyComboData.length > 6 && (
                  <Brush
                    {...BRUSH_DEFAULTS}
                    dataKey="month"
                    startIndex={Math.max(
                      0,
                      monthlyComboData.length - Math.ceil(monthlyComboData.length / 3),
                    )}
                  />
                )}
              </ComposedChart>
            </ChartContainer>
          )}
        </motion.div>

        {/* ── P&L Breakdown: Income vs Expenses ── */}
        {investmentAccounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-2xl p-4 sm:p-6"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">Detailed Breakdown</h3>
            <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4" initial="hidden" animate="visible" variants={staggerContainer}>
              <motion.div variants={fadeUpItem} className="bg-app-green/5 border border-app-green/15 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Banknote className="w-4 h-4 text-app-green" />
                  <p className="text-sm font-medium text-foreground">Income Sources</p>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Investment Profit', value: investmentProfit, color: 'text-app-green' },
                    { label: 'Dividend Income', value: dividendIncome, color: 'text-app-green' },
                    { label: 'Interest Income', value: interestIncome, color: 'text-app-teal' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className={`text-sm font-semibold ${item.color}`}>{formatCurrency(item.value)}</span>
                      </div>
                      {totalIncome > 0 && (
                        <div className="h-1.5 bg-[var(--overlay-2)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${(item.value / totalIncome) * 100}%`, backgroundColor: rawColors.app.green }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-app-green/10 pt-3">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <span className="text-lg font-bold text-app-green">{formatCurrency(totalIncome)}</span>
                  </div>
                </div>
              </motion.div>
              <motion.div variants={fadeUpItem} className="bg-app-red/5 border border-app-red/15 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="w-4 h-4 text-app-red" />
                  <p className="text-sm font-medium text-foreground">Costs & Losses</p>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Investment Loss', value: investmentLoss, color: 'text-app-red' },
                    { label: 'Broker Fees', value: brokerFees, color: 'text-app-orange' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className={`text-sm font-semibold ${item.color}`}>{formatCurrency(item.value)}</span>
                      </div>
                      {totalExpenses > 0 && (
                        <div className="h-1.5 bg-[var(--overlay-2)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${(item.value / totalExpenses) * 100}%`, backgroundColor: rawColors.app.red }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-app-red/10 pt-3">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <span className="text-lg font-bold text-app-red">{formatCurrency(totalExpenses)}</span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
            {/* Net P&L footer */}
            <div className="mt-4 bg-[var(--overlay-2)] border border-border rounded-xl p-5">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-foreground">Net Profit/Loss</span>
                <span className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-app-green' : 'text-app-red'}`}>
                  {netProfitLoss >= 0 ? '+' : ''}{formatCurrency(netProfitLoss)}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Holdings Bar Chart ── */}
        {investmentAccounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-4 sm:p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-5 h-5 text-app-purple" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Holdings by Value</h3>
                <p className="text-xs text-text-tertiary">
                  Investment accounts ranked by current balance.
                  {investmentAccounts.length > 0 && (
                    <> Top holding: <span className="text-foreground font-medium">{investmentAccounts[0].name}</span> ({formatCurrencyShort(investmentAccounts[0].balance)}).</>
                  )}
                </p>
              </div>
            </div>
            <ChartContainer
              height={Math.max(280, investmentAccounts.length * 36)}
              mobileHeight={Math.max(240, Math.min(investmentAccounts.length, 12) * 32)}
              ariaLabel="Horizontal bar chart of investment accounts ranked by current balance."
            >
              <BarChart
                data={investmentAccounts.slice(0, 12).map((acc) => ({
                  name: acc.name,
                  value: acc.balance,
                  transactions: acc.transactions,
                }))}
                layout="vertical"
                margin={{ top: 8, right: 24, bottom: 8, left: 12 }}
              >
                <CartesianGrid {...GRID_DEFAULTS} horizontal={false} vertical={true} />
                <XAxis
                  type="number"
                  {...xAxisDefaults(investmentAccounts.length)}
                  tickFormatter={(v: number) => formatCurrencyShort(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={holdingsAxisWidth}
                  tick={{ fill: rawColors.text.tertiary, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  content={AccountTooltip as never}
                />
                <Bar
                  dataKey="value"
                  fill={rawColors.app.purple}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={shouldAnimate(investmentAccounts.length)}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {investmentAccounts.slice(0, 12).map((acc, idx) => (
                    <Cell
                      key={acc.name}
                      fill={rawColors.app.purple}
                      fillOpacity={1 - idx * 0.05}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            {investmentAccounts.length > 12 && (
              <p className="text-xs text-text-tertiary mt-3 text-center">
                Showing top 12 of {investmentAccounts.length} accounts
              </p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
