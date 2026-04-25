import { motion } from 'framer-motion'
import { ArrowDown } from 'lucide-react'

import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'

interface CategoryEntry {
  readonly name: string
  readonly amount: number
}

interface Props {
  readonly incomeByCategory: readonly CategoryEntry[]
  readonly expenseByCategory: readonly CategoryEntry[]
  readonly totalIncome: number
  readonly totalExpense: number
  readonly netSavings: number
}

/**
 * Mobile-first vertical flow: Income sources -> Total Income -> Savings + Expenses split
 * -> Expense categories. Bar width is proportional to the row's share of its section.
 */
export default function MobileFlowView({
  incomeByCategory,
  expenseByCategory,
  totalIncome,
  totalExpense,
  netSavings,
}: Props) {
  const incomeMax = incomeByCategory[0]?.amount ?? 0
  const expenseMax = expenseByCategory[0]?.amount ?? 0
  const savingsShare = totalIncome > 0 ? Math.max(netSavings, 0) / totalIncome : 0
  const expenseShare = totalIncome > 0 ? totalExpense / totalIncome : 0

  return (
    <div className="space-y-4">
      {/* Income sources */}
      <Section title="Income sources" total={totalIncome} totalColor={rawColors.app.green}>
        {incomeByCategory.map((entry, idx) => (
          <FlowRow
            key={entry.name}
            label={entry.name}
            amount={entry.amount}
            percent={totalIncome > 0 ? entry.amount / totalIncome : 0}
            barWidth={incomeMax > 0 ? entry.amount / incomeMax : 0}
            color={rawColors.app.green}
            delay={idx * 0.03}
          />
        ))}
      </Section>

      <Arrow />

      {/* Total Income pill */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border p-4 text-center"
        style={{
          background: `linear-gradient(135deg, ${rawColors.app.indigo}22, ${rawColors.app.purple}22)`,
        }}
      >
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Total Income
        </p>
        <p className="text-2xl font-bold text-white mt-1 break-all">
          {formatCurrency(totalIncome)}
        </p>
      </motion.div>

      <Arrow />

      {/* Savings vs Expenses split */}
      <div className="grid grid-cols-2 gap-3">
        <SplitCard
          label="Savings"
          amount={Math.max(netSavings, 0)}
          percent={savingsShare}
          color={rawColors.app.purple}
        />
        <SplitCard
          label="Expenses"
          amount={totalExpense}
          percent={expenseShare}
          color={rawColors.app.pink}
        />
      </div>

      {expenseByCategory.length > 0 && (
        <>
          <Arrow />

          {/* Expense categories */}
          <Section
            title="Where expenses went"
            total={totalExpense}
            totalColor={rawColors.app.red}
          >
            {expenseByCategory.map((entry, idx) => (
              <FlowRow
                key={entry.name}
                label={entry.name}
                amount={entry.amount}
                percent={totalExpense > 0 ? entry.amount / totalExpense : 0}
                barWidth={expenseMax > 0 ? entry.amount / expenseMax : 0}
                color={rawColors.app.red}
                delay={idx * 0.03}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({
  title,
  total,
  totalColor,
  children,
}: Readonly<{
  title: string
  total: number
  totalColor: string
  children: React.ReactNode
}>) {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.02] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h4>
        <span className="text-sm font-semibold break-all" style={{ color: totalColor }}>
          {formatCurrency(total)}
        </span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function FlowRow({
  label,
  amount,
  percent,
  barWidth,
  color,
  delay,
}: Readonly<{
  label: string
  amount: number
  percent: number
  barWidth: number
  color: string
  delay: number
}>) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.25 }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-sm text-white truncate flex-1 min-w-0">{label}</span>
        <span className="text-xs text-text-tertiary shrink-0">{formatPercent(percent * 100)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(barWidth * 100, 2)}%` }}
            transition={{ delay, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="h-full rounded-full"
            style={{ background: color }}
          />
        </div>
        <span className="text-xs font-medium text-white shrink-0 tabular-nums break-all">
          {formatCurrency(amount)}
        </span>
      </div>
    </motion.div>
  )
}

function SplitCard({
  label,
  amount,
  percent,
  color,
}: Readonly<{
  label: string
  amount: number
  percent: number
  color: string
}>) {
  return (
    <div
      className="rounded-2xl border p-4 text-center"
      style={{
        borderColor: `${color}33`,
        background: `${color}11`,
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color }}>
        {label}
      </p>
      <p className="text-lg font-bold text-white mt-1 break-all">{formatCurrency(amount)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{formatPercent(percent * 100)}</p>
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex justify-center">
      <ArrowDown className="w-5 h-5 text-text-quaternary" />
    </div>
  )
}
