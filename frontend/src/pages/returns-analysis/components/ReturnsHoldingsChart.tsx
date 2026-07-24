import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  GRID_DEFAULTS,
  chartTooltipProps,
  shouldAnimate,
  xAxisDefaults,
} from '@/components/ui'
import { CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from '@/components/ui/ChartTooltip'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

export interface InvestmentAccount {
  readonly name: string
  readonly balance: number
  readonly transactions: number
}

function AccountTooltip({
  active,
  payload,
}: Readonly<{
  active?: boolean
  payload?: Array<{ payload: { name: string; value: number; transactions: number } }>
}>) {
  if (!active || !payload?.length) return null
  const account = payload[0].payload

  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p style={{ ...CHART_TOOLTIP_LABEL_STYLE, marginBottom: 6 }}>{account.name}</p>
      <div style={{ color: rawColors.chart.textPrimary, fontSize: 14, fontWeight: 600 }}>
        {formatCurrency(account.value)}
      </div>
      <div style={{ color: rawColors.chart.textSubtle, fontSize: 11, marginTop: 2 }}>
        {account.transactions} transaction{account.transactions === 1 ? '' : 's'}
      </div>
    </div>
  )
}

export default function ReturnsHoldingsChart({
  accounts,
}: Readonly<{ accounts: readonly InvestmentAccount[] }>) {
  const { breakpoint } = useChartDimensions()
  const holdingsAxisWidth = breakpoint === 'mobile' ? 84 : 140
  const displayedAccounts = accounts.slice(0, 12)

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 sm:p-6"
      aria-labelledby="holdings-value-title"
    >
      <div className="mb-4 flex items-center gap-3">
        <Activity className="size-5 text-app-purple" aria-hidden="true" />
        <div>
          <h2 id="holdings-value-title" className="text-lg font-semibold text-foreground">
            Holdings by Value
          </h2>
          <p className="text-pretty text-xs text-text-tertiary">
            Investment accounts ranked by current balance. Top holding:{' '}
            <span className="font-medium text-foreground">{accounts[0].name}</span> (
            {formatCurrencyShort(accounts[0].balance)}).
          </p>
        </div>
      </div>

      <ChartContainer
        height={Math.max(280, accounts.length * 36)}
        mobileHeight={Math.max(240, Math.min(accounts.length, 12) * 32)}
        ariaLabel="Horizontal bar chart of investment accounts ranked by current balance."
      >
        <BarChart
          data={displayedAccounts.map((account) => ({
            name: account.name,
            value: account.balance,
            transactions: account.transactions,
          }))}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 8, left: 12 }}
        >
          <CartesianGrid {...GRID_DEFAULTS} horizontal={false} vertical />
          <XAxis
            type="number"
            {...xAxisDefaults(accounts.length)}
            tickFormatter={(value: number) => formatCurrencyShort(value)}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={holdingsAxisWidth}
            tick={{ fill: rawColors.text.tertiary, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: rawColors.chart.axisLine }}
          />
          <Tooltip cursor={chartTooltipProps.cursor} content={AccountTooltip as never} />
          <Bar
            dataKey="value"
            fill={rawColors.app.purple}
            radius={[0, 4, 4, 0]}
            isAnimationActive={shouldAnimate(accounts.length)}
            animationDuration={600}
            animationEasing="ease-out"
          >
            {displayedAccounts.map((account, index) => (
              <Cell
                key={account.name}
                fill={rawColors.app.purple}
                fillOpacity={1 - index * 0.05}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>

      {accounts.length > 12 && (
        <p className="mt-3 text-center text-xs text-text-tertiary">
          Showing top 12 of {accounts.length} accounts
        </p>
      )}
    </motion.section>
  )
}
