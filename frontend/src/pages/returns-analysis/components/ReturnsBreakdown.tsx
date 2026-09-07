import { motion } from 'motion/react'
import { Banknote, Receipt } from 'lucide-react'

import { DURATION, EASING } from '@/constants/animations'
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
    <div className="min-w-0 py-4 first:pt-0 last:pb-0 md:px-5 md:py-0 md:first:pl-0 md:last:pr-0">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-start justify-between gap-3">
              <span className="min-w-0 text-xs text-muted-foreground">{item.label}</span>
              <span className={`ledger-figure min-w-0 break-words text-right text-sm font-semibold ${item.color}`}>
                {formatCurrency(item.value)}
              </span>
            </div>
            {total > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--overlay-2)]">
                <motion.div
                  className="h-full origin-left rounded-full"
                  role="progressbar"
                  aria-label={`${item.label} share of ${title.toLowerCase()}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((item.value / total) * 100)}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: Math.max(0, Math.min(item.value / total, 1)) }}
                  transition={{ duration: DURATION.slow, ease: EASING.cinematic }}
                  style={{ backgroundColor: barColor }}
                />
              </div>
            )}
          </div>
        ))}
        <div
          className={`flex items-start justify-between gap-3 border-t pt-3 ${
            tone === 'green' ? 'border-app-green/10' : 'border-app-red/10'
          }`}
        >
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span
            className={`ledger-figure min-w-0 break-words text-right text-lg font-bold ${
              tone === 'green' ? 'text-app-green' : 'text-app-red'
            }`}
          >
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
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
    <section
      className="ledger-panel p-4 sm:p-5"
      aria-labelledby="returns-breakdown-title"
    >
      <h2 id="returns-breakdown-title" className="mb-4 text-lg font-semibold text-foreground">
        Detailed Breakdown
      </h2>
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
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
      </div>

      <div className="mt-5 flex flex-col gap-1 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-base font-semibold text-foreground">Net Profit/Loss</span>
        <span
          className={`ledger-figure break-words text-2xl font-bold ${
            netProfitLoss >= 0 ? 'text-app-green' : 'text-app-red'
          }`}
        >
          {netProfitLoss >= 0 ? '+' : ''}
          {formatCurrency(netProfitLoss)}
        </span>
      </div>
    </section>
  )
}
