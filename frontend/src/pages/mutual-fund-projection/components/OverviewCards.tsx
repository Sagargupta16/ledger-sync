import { motion } from 'framer-motion'
import { Calculator, Percent, TrendingUp } from 'lucide-react'

import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import { formatCurrency } from '@/lib/formatters'

interface OverviewCardsProps {
  isLoading: boolean
  currentBalance: number
  primaryAccountName: string | null
  detectedMonthlySIP: number
  transactionCount: number
  totalHistoricalInvested: number
  realizedGains: number
  realizedGainsPercent: number
  gainsBgClass: string
  gainsIconClass: string
  gainsTextClass: string
  gainsSignPrefix: string
}

export function OverviewCards(props: Readonly<OverviewCardsProps>) {
  const {
    isLoading,
    currentBalance,
    primaryAccountName,
    detectedMonthlySIP,
    transactionCount,
    totalHistoricalInvested,
    realizedGains,
    realizedGainsPercent,
    gainsBgClass,
    gainsIconClass,
    gainsTextClass,
    gainsSignPrefix,
  } = props

  if (isLoading) {
    return <CardGridSkeleton count={4} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" />
  }

  const currentBalanceDisplay = formatCurrency(currentBalance)
  const monthlySipDisplay = formatCurrency(detectedMonthlySIP)
  const totalInvestedDisplay = formatCurrency(totalHistoricalInvested)
  const realizedGainsDisplay = formatCurrency(realizedGains)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-3 bg-app-purple/20 rounded-xl shrink-0">
            <TrendingUp className="w-6 h-6 text-app-purple" />
          </div>
          <div className="min-w-0">
            <p className="text-kpi-label text-muted-foreground">Current Balance</p>
            <p className="text-kpi-value font-bold truncate">{currentBalanceDisplay}</p>
            {primaryAccountName && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{primaryAccountName}</p>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-3 bg-app-green/20 rounded-xl shrink-0">
            <Calculator className="w-6 h-6 text-app-green" />
          </div>
          <div className="min-w-0">
            <p className="text-kpi-label text-muted-foreground">Monthly SIP</p>
            <p className="text-kpi-value font-bold truncate">{monthlySipDisplay}</p>
            <p className="text-xs text-muted-foreground mt-1">{transactionCount} transactions</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-3 bg-app-blue/20 rounded-xl shrink-0">
            <Percent className="w-6 h-6 text-app-blue" />
          </div>
          <div className="min-w-0">
            <p className="text-kpi-label text-muted-foreground">Total Invested</p>
            <p className="text-kpi-value font-bold truncate">{totalInvestedDisplay}</p>
            <p className="text-xs text-muted-foreground mt-1">Actual contributions</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-3 rounded-xl shrink-0 ${gainsBgClass}`}>
            <TrendingUp className={`w-6 h-6 ${gainsIconClass}`} />
          </div>
          <div className="min-w-0">
            <p className="text-kpi-label text-muted-foreground">Realized Gain</p>
            <p className={`text-kpi-value font-bold truncate ${gainsTextClass}`}>
              {realizedGainsDisplay}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {gainsSignPrefix}
              {realizedGainsPercent.toFixed(2)}% returns
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
