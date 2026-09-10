import { motion } from 'motion/react'
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, TrendingUp } from 'lucide-react'

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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.35 }}
      className="ledger-panel grid min-w-0 grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-[1fr_1fr_1.15fr_0.85fr]"
    >
      <div className="min-w-0 border-b border-border p-4 min-[360px]:border-r sm:p-5 xl:border-b-0">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Total Income</p>
          <ArrowDownLeft className="size-4 text-income" aria-hidden="true" />
        </div>
        <p className="ledger-figure break-words text-xl font-semibold tracking-tight text-income sm:text-2xl" title={formatCurrency(totalIncome)}>{formatCurrency(totalIncome)}</p>
        <p className="mt-2 text-xs text-muted-foreground">Recorded inflow</p>
      </div>

      <div className="min-w-0 border-b border-border p-4 sm:p-5 xl:border-b-0 xl:border-r">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Total Expense</p>
          <ArrowUpRight className="size-4 text-expense" aria-hidden="true" />
        </div>
        <p className="ledger-figure break-words text-xl font-semibold tracking-tight text-expense sm:text-2xl" title={formatCurrency(totalExpense)}>{formatCurrency(totalExpense)}</p>
        <p className="mt-2 text-xs text-muted-foreground">Excluding tax</p>
      </div>

      <div className="min-w-0 border-b border-border bg-[var(--overlay-1)] p-4 min-[360px]:border-b-0 min-[360px]:border-r sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Net Savings</p>
          <ArrowRightLeft
            className={`size-4 ${netSavings >= 0 ? 'text-savings' : 'text-expense'}`}
            aria-hidden="true"
          />
        </div>
        <p
          className={`ledger-figure break-words text-xl font-semibold tracking-tight sm:text-2xl ${
            netSavings >= 0 ? 'text-foreground' : 'text-expense'
          }`}
          title={`${netSavings < 0 ? '-' : ''}${formatCurrency(Math.abs(netSavings))}`}
        >
          {netSavings < 0 && '-'}
          {formatCurrency(Math.abs(netSavings))}
        </p>
        <p className={`mt-2 text-xs ${netSavings < 0 ? 'font-medium text-expense' : 'text-muted-foreground'}`}>
          {netSavings < 0 ? 'Deficit' : 'After expenses and recorded tax'}
        </p>
      </div>

      <div className="min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Savings Rate</p>
          <TrendingUp
            className={`size-4 ${savingsRate >= SAVINGS_RATE_BENCHMARK ? 'text-income' : 'text-app-yellow'}`}
            aria-hidden="true"
          />
        </div>
        <p
          className={`ledger-figure text-xl font-semibold tracking-tight sm:text-2xl ${
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
          height={4}
          className="mt-3"
          ariaLabel={`Savings rate ${formatPercent(savingsRate)} against ${SAVINGS_RATE_BENCHMARK}% benchmark`}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {SAVINGS_RATE_BENCHMARK}% benchmark
        </p>
      </div>
    </motion.div>
  )
}
