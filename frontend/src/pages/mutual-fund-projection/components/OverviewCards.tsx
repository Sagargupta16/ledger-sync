import { motion } from 'framer-motion'
import { Calculator, Percent, TrendingUp } from 'lucide-react'

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

  const currentBalanceDisplay = isLoading ? '...' : formatCurrency(currentBalance)
  const monthlySipDisplay = isLoading ? '...' : formatCurrency(detectedMonthlySIP)
  const totalInvestedDisplay = isLoading ? '...' : formatCurrency(totalHistoricalInvested)
  const realizedGainsDisplay = isLoading ? '...' : formatCurrency(realizedGains)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-purple/20 rounded-xl">
            <TrendingUp className="w-6 h-6 text-app-purple" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Current Balance</p>
            <p className="text-2xl font-bold">{currentBalanceDisplay}</p>
            {primaryAccountName && (
              <p className="text-xs text-muted-foreground mt-1">{primaryAccountName}</p>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-green/20 rounded-xl">
            <Calculator className="w-6 h-6 text-app-green" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Monthly SIP</p>
            <p className="text-2xl font-bold">{monthlySipDisplay}</p>
            <p className="text-xs text-muted-foreground mt-1">{transactionCount} transactions</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-blue/20 rounded-xl">
            <Percent className="w-6 h-6 text-app-blue" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Invested</p>
            <p className="text-2xl font-bold">{totalInvestedDisplay}</p>
            <p className="text-xs text-muted-foreground mt-1">Actual contributions</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${gainsBgClass}`}>
            <TrendingUp className={`w-6 h-6 ${gainsIconClass}`} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Realized Gain</p>
            <p className={`text-2xl font-bold ${gainsTextClass}`}>{realizedGainsDisplay}</p>
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
