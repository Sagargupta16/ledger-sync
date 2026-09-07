import { Activity } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'

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

const ACCOUNT_LAYOUT = {
  mobile: { axisWidth: 78, nameLength: 12 },
  tablet: { axisWidth: 120, nameLength: 20 },
  desktop: { axisWidth: 150, nameLength: 28 },
} as const

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
      <div
        style={{
          color: rawColors.chart.textPrimary,
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
        }}
      >
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
  const { axisWidth: holdingsAxisWidth, nameLength: accountNameLength } =
    ACCOUNT_LAYOUT[breakpoint]
  const displayedAccounts = accounts.slice(0, 12)
  const formatAccountName = (name: string) =>
    name.length > accountNameLength ? `${name.slice(0, accountNameLength - 3)}...` : name

  return (
    <section
      className="ledger-panel p-4 sm:p-5"
      aria-labelledby="holdings-value-title"
    >
      <div className="mb-4 flex items-center gap-3">
        <Activity className="size-5 text-app-purple" aria-hidden="true" />
        <div>
          <h2 id="holdings-value-title" className="text-lg font-semibold text-foreground">
            Investment Accounts by Book Value
          </h2>
          <p className="text-pretty text-xs text-text-tertiary">
            Investment accounts ranked by ledger balance. Top account:{' '}
            <span className="font-medium text-foreground">{accounts[0].name}</span>
            {' ('}
            <span className="ledger-figure">{formatCurrencyShort(accounts[0].balance)}</span>
            {').'}
          </p>
        </div>
      </div>

      <ChartContainer
        height={Math.max(280, displayedAccounts.length * 36)}
        mobileHeight={Math.max(240, displayedAccounts.length * 32)}
        ariaLabel="Horizontal bar chart of investment accounts ranked by ledger balance."
      >
        <BarChart
          data={displayedAccounts.map((account, index) => ({
            name: account.name,
            value: account.balance,
            transactions: account.transactions,
            // Rank ramp: the top holding is solid, each row below it fades
            // slightly. Carried on the datum because Recharts merges each row
            // over its bar rectangle props, replacing the deprecated `<Cell>`.
            fillOpacity: 1 - index * 0.05,
          }))}
          layout="vertical"
          margin={{ top: 8, right: breakpoint === 'mobile' ? 12 : 24, bottom: 8, left: 4 }}
        >
          <CartesianGrid {...GRID_DEFAULTS} horizontal={false} vertical />
          <XAxis
            type="number"
            {...xAxisDefaults(displayedAccounts.length)}
            tickFormatter={(value: number) => formatCurrencyShort(value)}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={holdingsAxisWidth}
            tickFormatter={formatAccountName}
            tick={{ fill: rawColors.text.tertiary, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: rawColors.chart.axisLine }}
          />
          <Tooltip cursor={chartTooltipProps.cursor} content={AccountTooltip as never} />
          <Bar
            dataKey="value"
            fill={rawColors.app.purple}
            radius={[0, 4, 4, 0]}
            isAnimationActive={shouldAnimate(displayedAccounts.length)}
            animationDuration={600}
            animationEasing="ease-out"
          />
        </BarChart>
      </ChartContainer>

      {accounts.length > 12 && (
        <p className="mt-3 text-center text-xs text-text-tertiary">
          Showing top 12 of {accounts.length} accounts
        </p>
      )}
    </section>
  )
}
