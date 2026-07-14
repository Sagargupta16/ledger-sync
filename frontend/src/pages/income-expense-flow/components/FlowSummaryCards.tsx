import { motion } from 'framer-motion'
import { ArrowRightLeft, TrendingDown, TrendingUp } from 'lucide-react'

import { ProgressBar } from '@/components/shared'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'

const SAVINGS_RATE_BENCHMARK = 20

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
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      <div className="ledger-panel p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-app-green/10">
            <TrendingUp className="size-3.5 text-app-green" />
          </span>
          <p className="text-xs font-medium text-muted-foreground">Total Income</p>
        </div>
        <p className="ledger-figure truncate text-base font-semibold text-app-green sm:text-xl" title={formatCurrency(totalIncome)}>{formatCurrency(totalIncome)}</p>
      </div>

      <div className="ledger-panel p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-app-red/10">
            <TrendingDown className="size-3.5 text-app-red" />
          </span>
          <p className="text-xs font-medium text-muted-foreground">Total Expense</p>
        </div>
        <p className="ledger-figure truncate text-base font-semibold text-app-red sm:text-xl" title={formatCurrency(totalExpense)}>{formatCurrency(totalExpense)}</p>
      </div>

      <div className="ledger-panel p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${netSavings >= 0 ? 'bg-app-blue/10' : 'bg-app-red/10'}`}>
            <ArrowRightLeft
              className={`size-3.5 ${netSavings >= 0 ? 'text-primary' : 'text-app-red'}`}
            />
          </span>
          <p className="text-xs font-medium text-muted-foreground">Net Savings</p>
        </div>
        <p
          className={`ledger-figure truncate text-base font-semibold sm:text-xl ${
            netSavings >= 0 ? 'text-primary' : 'text-app-red'
          }`}
          title={`${netSavings < 0 ? '-' : ''}${formatCurrency(Math.abs(netSavings))}`}
        >
          {netSavings < 0 && <span aria-hidden>-</span>}
          {formatCurrency(Math.abs(netSavings))}
        </p>
        {netSavings < 0 && (
          <p className="text-xs font-medium text-app-red mt-1 uppercase tracking-wide">
            Deficit
          </p>
        )}
      </div>

      <div className="ledger-panel p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${savingsRate >= 20 ? 'bg-app-green/10' : 'bg-app-yellow/10'}`}>
            <TrendingUp
              className={`size-3.5 ${savingsRate >= 20 ? 'text-app-green' : 'text-app-yellow'}`}
            />
          </span>
          <p className="text-xs font-medium text-muted-foreground">Savings Rate</p>
        </div>
        <p
          className={`ledger-figure text-xl font-semibold ${
            savingsRate >= SAVINGS_RATE_BENCHMARK ? 'text-app-green' : 'text-app-yellow'
          }`}
        >
          {formatPercent(savingsRate)}
        </p>
        <ProgressBar
          value={Math.max(savingsRate, 0)}
          target={SAVINGS_RATE_BENCHMARK}
          color={
            savingsRate >= SAVINGS_RATE_BENCHMARK ? rawColors.app.green : rawColors.app.yellow
          }
          height={6}
          className="mt-3"
          ariaLabel={`Savings rate ${formatPercent(savingsRate)} against ${SAVINGS_RATE_BENCHMARK}% benchmark`}
        />
        <p className="text-xs text-text-tertiary mt-1.5">
          {SAVINGS_RATE_BENCHMARK}% benchmark
        </p>
      </div>
    </motion.div>
  )
}
