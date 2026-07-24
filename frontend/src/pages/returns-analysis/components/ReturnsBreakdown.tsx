import { motion } from 'framer-motion'
import { Banknote, Receipt } from 'lucide-react'

import { fadeUpItem, staggerContainer } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

interface ReturnsBreakdownProps {
  readonly investmentProfit: number
  readonly dividendIncome: number
  readonly interestIncome: number
  readonly investmentLoss: number
  readonly brokerFees: number
  readonly totalIncome: number
  readonly totalExpenses: number
  readonly netProfitLoss: number
}

interface BreakdownItem {
  readonly label: string
  readonly value: number
  readonly color: string
}

function BreakdownColumn({
  title,
  icon,
  items,
  total,
  tone,
}: Readonly<{
  title: string
  icon: React.ReactNode
  items: readonly BreakdownItem[]
  total: number
  tone: 'green' | 'red'
}>) {
  const barColor = tone === 'green' ? rawColors.app.green : rawColors.app.red

  return (
    <motion.div
      variants={fadeUpItem}
      className={`rounded-xl border p-5 ${
        tone === 'green'
          ? 'border-app-green/15 bg-app-green/5'
          : 'border-app-red/15 bg-app-red/5'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className={`ledger-figure shrink-0 text-sm font-semibold ${item.color}`}>
                {formatCurrency(item.value)}
              </span>
            </div>
            {total > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--overlay-2)]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(item.value / total) * 100}%`, backgroundColor: barColor }}
                />
              </div>
            )}
          </div>
        ))}
        <div
          className={`flex justify-between gap-3 border-t pt-3 ${
            tone === 'green' ? 'border-app-green/10' : 'border-app-red/10'
          }`}
        >
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span
            className={`ledger-figure shrink-0 text-lg font-bold ${
              tone === 'green' ? 'text-app-green' : 'text-app-red'
            }`}
          >
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default function ReturnsBreakdown({
  investmentProfit,
  dividendIncome,
  interestIncome,
  investmentLoss,
  brokerFees,
  totalIncome,
  totalExpenses,
  netProfitLoss,
}: ReturnsBreakdownProps) {
  const incomeItems: readonly BreakdownItem[] = [
    { label: 'Investment Profit', value: investmentProfit, color: 'text-app-green' },
    { label: 'Dividend Income', value: dividendIncome, color: 'text-app-green' },
    { label: 'Interest Income', value: interestIncome, color: 'text-app-teal' },
  ]
  const expenseItems: readonly BreakdownItem[] = [
    { label: 'Investment Loss', value: investmentLoss, color: 'text-app-red' },
    { label: 'Broker Fees', value: brokerFees, color: 'text-app-orange' },
  ]

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="glass rounded-2xl p-4 sm:p-6"
      aria-labelledby="returns-breakdown-title"
    >
      <h2 id="returns-breakdown-title" className="mb-4 text-lg font-semibold text-foreground">
        Detailed Breakdown
      </h2>
      <motion.div
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <BreakdownColumn
          title="Income Sources"
          icon={<Banknote className="size-4 text-app-green" aria-hidden="true" />}
          items={incomeItems}
          total={totalIncome}
          tone="green"
        />
        <BreakdownColumn
          title="Costs & Losses"
          icon={<Receipt className="size-4 text-app-red" aria-hidden="true" />}
          items={expenseItems}
          total={totalExpenses}
          tone="red"
        />
      </motion.div>

      <div className="mt-4 rounded-xl border border-border bg-[var(--overlay-2)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-lg font-semibold text-foreground">Net Profit/Loss</span>
          <span
            className={`ledger-figure text-2xl font-bold ${
              netProfitLoss >= 0 ? 'text-app-green' : 'text-app-red'
            }`}
          >
            {netProfitLoss >= 0 ? '+' : ''}
            {formatCurrency(netProfitLoss)}
          </span>
        </div>
      </div>
    </motion.section>
  )
}
