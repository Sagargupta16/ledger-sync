import { motion } from 'framer-motion'

import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

interface ProjectionResultsProps {
  invested: number
  value: number
  returns: number
  projectionYears: number
  activeMonthlySIP: number
}

export function ProjectionResults(props: Readonly<ProjectionResultsProps>) {
  const { invested, value, returns, projectionYears, activeMonthlySIP } = props

  const overallGainPercent = invested > 0 ? (returns / invested) * 100 : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="text-sm font-medium text-muted-foreground mb-1">Total Investment</div>
        <div className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(invested)}</div>
        <div className="text-sm text-muted-foreground mt-1">
          {projectionYears * 12} months @ {'₹'}
          {formatCurrencyShort(activeMonthlySIP)}/mo
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="text-sm font-medium text-muted-foreground mb-1">Projected Value</div>
        <div className="text-xl sm:text-2xl font-bold text-app-green truncate">
          {formatCurrency(value)}
        </div>
        <div className="text-sm text-muted-foreground mt-1">After {projectionYears} years</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.7 }}
        className="glass rounded-2xl border border-border col-span-2 lg:col-span-1 p-4 sm:p-6"
      >
        <div className="text-sm font-medium text-muted-foreground mb-1">Projected Returns</div>
        <div className="text-xl sm:text-2xl font-bold text-app-blue truncate">
          {formatCurrency(returns)}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {overallGainPercent.toFixed(1)}% overall gain
        </div>
      </motion.div>
    </div>
  )
}
