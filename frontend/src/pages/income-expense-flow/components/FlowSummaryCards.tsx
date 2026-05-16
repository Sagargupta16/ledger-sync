import { motion } from 'framer-motion'
import { ArrowRightLeft, TrendingDown, TrendingUp } from 'lucide-react'

import { formatCurrency, formatPercent } from '@/lib/formatters'

interface FlowSummaryCardsProps {
  totalIncome: number
  totalExpense: number
  netSavings: number
  savingsRate: number
}

export function FlowSummaryCards(props: Readonly<FlowSummaryCardsProps>) {
  const { totalIncome, totalExpense, netSavings, savingsRate } = props
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
    >
      <div className="glass rounded-2xl border border-border border-l-4 border-l-app-green p-6">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-5 h-5 text-app-green" />
          <p className="text-sm text-muted-foreground">Total Income</p>
        </div>
        <p className="text-2xl font-bold text-app-green">{formatCurrency(totalIncome)}</p>
      </div>

      <div className="glass rounded-2xl border border-border border-l-4 border-l-app-red p-6">
        <div className="flex items-center gap-3 mb-2">
          <TrendingDown className="w-5 h-5 text-app-red" />
          <p className="text-sm text-muted-foreground">Total Expense</p>
        </div>
        <p className="text-2xl font-bold text-app-red">{formatCurrency(totalExpense)}</p>
      </div>

      <div className="glass rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-2">
          <ArrowRightLeft
            className={`w-5 h-5 ${netSavings >= 0 ? 'text-primary' : 'text-app-red'}`}
          />
          <p className="text-sm text-muted-foreground">Net Savings</p>
        </div>
        <p
          className={`text-2xl font-bold ${
            netSavings >= 0 ? 'text-primary' : 'text-app-red'
          }`}
        >
          {formatCurrency(Math.abs(netSavings))}
        </p>
      </div>

      <div className="glass rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp
            className={`w-5 h-5 ${savingsRate >= 20 ? 'text-app-green' : 'text-app-yellow'}`}
          />
          <p className="text-sm text-muted-foreground">Savings Rate</p>
        </div>
        <p
          className={`text-2xl font-bold ${
            savingsRate >= 20 ? 'text-app-green' : 'text-app-yellow'
          }`}
        >
          {formatPercent(savingsRate)}
        </p>
      </div>
    </motion.div>
  )
}
