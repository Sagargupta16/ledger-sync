import { motion } from 'motion/react'
import { DollarSign, PieChart, Target, TrendingUp, Wallet } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import { DURATION, EASING } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'

interface PortfolioMetricsProps {
  totalInvestmentValue: number
  investmentAccountsCount: number
  netInvestmentPL: number
  plPercent: number
  /**
   * Largest single holding by amount invested. Allocation mix is a cost-basis
   * fact the statements DO support, unlike any rate of return.
   */
  topHolding: { name: string; value: number } | null
  monthlyInvestmentTarget: number
  currentMonthInvestment: number
  targetProgress: number
  isLoading: boolean
}

export function PortfolioMetrics(props: Readonly<PortfolioMetricsProps>) {
  const {
    totalInvestmentValue,
    investmentAccountsCount,
    netInvestmentPL,
    plPercent,
    topHolding,
    monthlyInvestmentTarget,
    currentMonthInvestment,
    targetProgress,
    isLoading,
  } = props

  const topHoldingShare =
    topHolding && totalInvestmentValue > 0 ? (topHolding.value / totalInvestmentValue) * 100 : 0
  const targetScale = Math.min(Math.max(targetProgress, 0), 100) / 100

  return (
    <div
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 ${
        monthlyInvestmentTarget > 0 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
      }`}
    >
      <MetricCard
        title="Total Investment Value"
        value={formatCurrency(totalInvestmentValue)}
        subtitle="Net contributions (book value)"
        icon={TrendingUp}
        color="green"
        isLoading={isLoading}
      />
      <MetricCard
        title="Portfolio Assets"
        value={investmentAccountsCount}
        icon={Wallet}
        color="blue"
        isLoading={isLoading}
      />
      <MetricCard
        title="Net Investment P&L"
        value={`${netInvestmentPL >= 0 ? '+' : ''}${formatCurrency(netInvestmentPL)}`}
        subtitle={`${plPercent >= 0 ? '+' : ''}${formatPercent(plPercent)} of portfolio`}
        icon={DollarSign}
        color={netInvestmentPL >= 0 ? 'green' : 'red'}
        isLoading={isLoading}
      />
      {/* Was "Cashflow XIRR". Its terminal value was the very book value those
          contributions produced, so the solved rate described the arithmetic and
          not the portfolio -- it printed a confident -2.9% p.a. on real data.
          A rate of return needs a market value; allocation mix does not, so show
          concentration instead. CostBasisOnlyNotice on the page carries the why. */}
      <MetricCard
        title="Largest Holding"
        value={topHolding ? formatCurrency(topHolding.value) : '-'}
        subtitle={
          topHolding
            ? `${topHolding.name} - ${formatPercent(topHoldingShare)} of invested`
            : 'No holdings yet'
        }
        icon={PieChart}
        color="teal"
        isLoading={isLoading}
        titleInfo="Biggest single investment account by amount contributed, and its share of total invested"
      />
      {monthlyInvestmentTarget > 0 && (
        <div
          className="ledger-panel p-4 sm:col-span-2 sm:p-5 xl:col-span-1"
        >
          <div className="mb-3 inline-flex rounded-md bg-app-orange/15 p-2">
            <Target className="size-5 text-app-orange" aria-hidden="true" />
          </div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Monthly Target</h3>
          <p className="ledger-figure break-words text-xl font-semibold text-foreground">
            {formatCurrency(monthlyInvestmentTarget)}
          </p>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="ledger-figure text-text-tertiary">
                {formatCurrency(currentMonthInvestment)} invested
              </span>
              <span
                className={`ledger-figure ${
                  targetProgress >= 100
                    ? 'text-app-green font-medium'
                    : 'text-app-orange font-medium'
                }`}
              >
                {targetProgress.toFixed(0)}%
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-[var(--overlay-5)]"
              role="progressbar"
              aria-label="Monthly investment target progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(targetProgress)}
            >
              <motion.div
                className="h-full w-full origin-left rounded-full"
                style={{
                  background: targetProgress >= 100 ? rawColors.app.green : rawColors.app.orange,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: targetScale }}
                transition={{ duration: DURATION.default, ease: EASING.cinematic }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
