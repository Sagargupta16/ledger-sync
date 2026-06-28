import { motion } from 'framer-motion'
import { DollarSign, LineChart, Target, TrendingUp, Wallet } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'

interface PortfolioMetricsProps {
  totalInvestmentValue: number
  investmentAccountsCount: number
  netInvestmentPL: number
  plPercent: number
  portfolioXIRR: number
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
    portfolioXIRR,
    monthlyInvestmentTarget,
    currentMonthInvestment,
    targetProgress,
    isLoading,
  } = props

  const xirrSign = portfolioXIRR >= 0 ? '+' : ''
  const xirrValue = portfolioXIRR === 0 ? '-' : `${xirrSign}${portfolioXIRR.toFixed(1)}%`

  return (
    <div
      className={`grid grid-cols-2 ${monthlyInvestmentTarget > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3 sm:gap-4 lg:gap-6`}
    >
      <MetricCard
        title="Total Investment Value"
        value={formatCurrency(totalInvestmentValue)}
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
      <MetricCard
        title="Portfolio XIRR"
        value={xirrValue}
        subtitle={portfolioXIRR === 0 ? 'Needs dated flows' : 'Annualized, all flows'}
        icon={LineChart}
        color={portfolioXIRR >= 0 ? 'green' : 'red'}
        isLoading={isLoading}
      />
      {monthlyInvestmentTarget > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative col-span-2 lg:col-span-1 p-4 md:p-6 glass rounded-2xl overflow-hidden group border border-white/5 border-t-white/10 border-l-white/10"
        >
          <div
            className="inline-flex p-3 rounded-2xl mb-4 bg-app-orange/15"
            style={{ boxShadow: '0 8px 24px rgba(255,159,10,0.15)' }}
          >
            <Target className="w-6 h-6 text-app-orange" />
          </div>
          <h3 className="text-sm font-medium mb-1 text-text-secondary">Monthly Target</h3>
          <p className="text-xl sm:text-2xl md:text-3xl font-semibold text-white">
            {formatCurrency(monthlyInvestmentTarget)}
          </p>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-tertiary">
                {formatCurrency(currentMonthInvestment)} invested
              </span>
              <span
                className={
                  targetProgress >= 100
                    ? 'text-app-green font-medium'
                    : 'text-app-orange font-medium'
                }
              >
                {targetProgress.toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: targetProgress >= 100 ? rawColors.app.green : rawColors.app.orange,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${targetProgress}%` }}
                transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
