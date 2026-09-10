import { motion } from 'motion/react'
import { ArrowDown, ChevronRight } from 'lucide-react'

import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'

import type { DrillCrumb, FlowEntry, SankeyView } from '../sankeyDrilldown'

interface Props {
  readonly incomeByCategory: readonly FlowEntry[]
  readonly expenseByCategory: readonly FlowEntry[]
  readonly totalIncome: number
  readonly totalExpense: number
  readonly totalTax: number
  readonly netSavings: number
  readonly view: SankeyView
  readonly drillPath: DrillCrumb[]
  readonly drillDirection: 'in' | 'out'
  readonly drillInto: (crumb: DrillCrumb) => void
}

/**
 * Mobile-first vertical flow: Income sources -> Total Income -> Savings + Expenses split
 * -> Expense categories. Bar width is proportional to the row's share of its section.
 * Rows with a breakdown are tappable and drill into subcategories (the page-level
 * breadcrumb handles the way back).
 */
export default function MobileFlowView({
  incomeByCategory,
  expenseByCategory,
  totalIncome,
  totalExpense,
  totalTax,
  netSavings,
  view,
  drillPath,
  drillDirection,
  drillInto,
}: Props) {
  const crumb = drillPath.at(-1)
  const viewKey = drillPath.map((c) => `${c.flow}:${c.label}`).join('/') || 'overview'
  // Same zoom language as the desktop chart: drilling in grows the new view
  // out of the tapped row; going back settles the parent down from oversized.
  const enterFrom =
    drillDirection === 'in'
      ? { opacity: 0, scale: 0.9, y: 12 }
      : { opacity: 0, scale: 1.06, y: -8 }

  // Drilled view: one section listing the parent's breakdown.
  if (crumb) {
    const rows = view.rows
    const max = rows.reduce((m, r) => Math.max(m, r.amount), 0)
    const color = crumb.flow === 'income' ? rawColors.app.green : rawColors.app.red
    return (
      <motion.div
        key={viewKey}
        initial={enterFrom}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        style={{ transformOrigin: '50% 20%' }}
      >
        <Section
          title={`${crumb.label} breakdown`}
          total={view.rowsTotal}
          totalColor={color}
        >
          {rows.map((entry, idx) => (
            <FlowRow
              key={entry.name}
              label={entry.name}
              amount={entry.amount}
              percent={view.rowsTotal > 0 ? entry.amount / view.rowsTotal : 0}
              barWidth={max > 0 ? entry.amount / max : 0}
              color={color}
              delay={idx * 0.03}
              onDrill={entry.drill ? () => drillInto(entry.drill!) : undefined}
            />
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No breakdown available.</p>
          )}
        </Section>
      </motion.div>
    )
  }

  const incomeMax = incomeByCategory[0]?.amount ?? 0
  const expenseMax = expenseByCategory[0]?.amount ?? 0
  const savingsShare = totalIncome > 0 ? Math.max(netSavings, 0) / totalIncome : 0
  const expenseShare = totalIncome > 0 ? totalExpense / totalIncome : 0
  const taxDrill = view.meta[view.nodes.findLastIndex((node) => node.name === 'Tax')]?.drill

  return (
    <motion.div
      key={viewKey}
      initial={enterFrom}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      style={{ transformOrigin: '50% 15%' }}
      className="space-y-5"
    >
      {/* Income sources */}
      <Section step="01" title="Income sources" total={totalIncome} totalColor={rawColors.app.green}>
        {incomeByCategory.map((entry, idx) => (
          <FlowRow
            key={entry.name}
            label={entry.name}
            amount={entry.amount}
            percent={totalIncome > 0 ? entry.amount / totalIncome : 0}
            barWidth={incomeMax > 0 ? entry.amount / incomeMax : 0}
            color={rawColors.app.green}
            delay={idx * 0.03}
            onDrill={entry.drill ? () => drillInto(entry.drill!) : undefined}
          />
        ))}
      </Section>

      <Arrow />

      {/* Recorded income stays distinct from the desktop gross-income pool. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-y border-border bg-[var(--overlay-1)] px-4 py-5"
      >
        <p className="mb-3 flex items-center gap-3 text-xs font-medium text-muted-foreground">
          <span className="font-mono text-[10px]">02</span>{' '}
          Total Income
        </p>
        <p
          className="break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground"
          title={formatCurrency(totalIncome)}
        >
          {formatCurrency(totalIncome)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Recorded income for the selected period</p>
      </motion.div>

      <Arrow />

      {/* The bar compares savings and expenses; labels retain their shares of
          recorded income. Tax remains separate in the allocation below. */}
      {totalIncome > 0 && (
        <SplitShareBar savingsShare={savingsShare} expenseShare={expenseShare} />
      )}

      <h4 className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span className="font-mono text-[10px]">03</span>{' '}
        Allocation
      </h4>
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
          color={rawColors.app.red}
        />
        {totalTax > 0 && (
          <SplitCard
            label="Tax"
            amount={totalTax}
            percent={totalIncome > 0 ? totalTax / totalIncome : 0}
            color={rawColors.app.orange}
            className="col-span-2"
            onDrill={taxDrill ? () => drillInto(taxDrill) : undefined}
          />
        )}
      </div>
      {view.rowsTotal !== totalIncome && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Allocation shares use recorded income. Tax also includes computed TDS at source,
          which is outside recorded income.
        </p>
      )}
      {netSavings < 0 && (
        <p className="text-sm text-expense">
          Deficit: <span className="font-mono font-medium tabular-nums">{formatCurrency(netSavings)}</span>
        </p>
      )}

      {expenseByCategory.length > 0 && (
        <>
          <Arrow />

          {/* Expense categories */}
          <Section
            step="04"
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
                onDrill={entry.drill ? () => drillInto(entry.drill!) : undefined}
              />
            ))}
          </Section>
        </>
      )}
    </motion.div>
  )
}

function Section({
  step,
  title,
  total,
  totalColor,
  children,
}: Readonly<{
  step?: string
  title: string
  total: number
  totalColor: string
  children: React.ReactNode
}>) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-2 border-b border-border pb-3">
        <h4 className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
          {step && <span className="font-mono text-[10px]">{step}</span>}
          {title}
        </h4>
        <span
          className="break-words font-mono text-sm font-semibold tabular-nums"
          style={{ color: totalColor }}
          title={formatCurrency(total)}
        >
          {formatCurrency(total)}
        </span>
      </div>
      <div className="divide-y divide-border/60">{children}</div>
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
  onDrill,
}: Readonly<{
  label: string
  amount: number
  percent: number
  barWidth: number
  color: string
  delay: number
  onDrill?: () => void
}>) {
  const row = (
    <>
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <span className="inline-flex min-w-0 items-center gap-1 text-sm font-medium leading-snug text-foreground">
          {label}
          {onDrill && <ChevronRight className="w-3.5 h-3.5 text-text-quaternary shrink-0" aria-hidden />}
        </span>
        <span className="font-mono text-xs font-medium tabular-nums text-foreground">
          {formatCurrency(amount)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--overlay-2)]">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Math.min(Math.max(barWidth, 0.02), 1) }}
            transition={{ delay, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="h-full w-full origin-left rounded-full"
            style={{ background: color }}
          />
        </div>
        <span
          className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground"
        >
          {formatPercent(percent * 100)}
        </span>
      </div>
    </>
  )

  if (onDrill) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay, duration: 0.25 }}
      >
        <button
          type="button"
          onClick={onDrill}
          aria-label={`${label}: see breakdown`}
          className="block min-h-14 w-full rounded-md px-2 py-3 text-left transition-colors hover:bg-[var(--overlay-2)] active:bg-[var(--overlay-2)]"
        >
          {row}
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="px-2 py-3"
    >
      {row}
    </motion.div>
  )
}

function SplitShareBar({
  savingsShare,
  expenseShare,
}: Readonly<{ savingsShare: number; expenseShare: number }>) {
  // Render widths are normalized so the two segments always fill the track even
  // in a deficit month (expenseShare > 1, savingsShare 0). The labels keep the
  // true share-of-income percentages.
  const total = savingsShare + expenseShare
  const savingsWidth = total > 0 ? (savingsShare / total) * 100 : 0
  const expenseWidth = total > 0 ? (expenseShare / total) * 100 : 100

  return (
    <div className="min-w-0 py-1">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-medium text-foreground">
          Savings / expenses
        </h4>
        <span className="text-[10px] text-muted-foreground">share of recorded income</span>
      </div>
      <div className="flex h-3 w-full gap-1 overflow-hidden rounded-sm bg-[var(--overlay-2)]">
        {savingsWidth > 0 && (
          <div className="h-full overflow-hidden" style={{ width: `${savingsWidth}%` }}>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="h-full w-full origin-left"
              style={{ background: rawColors.app.purple }}
            />
          </div>
        )}
        <div className="h-full overflow-hidden" style={{ width: `${expenseWidth}%` }}>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="h-full w-full origin-left"
            style={{ background: rawColors.app.red }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="flex items-center gap-1.5" style={{ color: rawColors.app.purple }}>
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: rawColors.app.purple }}
            aria-hidden
          />
          Saved {formatPercent(savingsShare * 100)}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: rawColors.app.red }}>
          Spent {formatPercent(expenseShare * 100)}
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: rawColors.app.red }}
            aria-hidden
          />
        </span>
      </div>
    </div>
  )
}

function SplitCard({
  label,
  amount,
  percent,
  color,
  className = '',
  onDrill,
}: Readonly<{
  label: string
  amount: number
  percent: number
  color: string
  className?: string
  onDrill?: () => void
}>) {
  const content = (
    <>
      <p className="flex items-center gap-2 text-xs font-medium" style={{ color }}>
        <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
        {label}
        {onDrill && <ChevronRight className="ml-auto size-3.5" aria-hidden="true" />}
      </p>
      <p
        className="mt-3 break-words font-mono text-sm font-semibold tabular-nums text-foreground min-[400px]:text-base"
        title={formatCurrency(amount)}
      >
        {formatCurrency(amount)}
      </p>
      <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">{formatPercent(percent * 100)}</p>
    </>
  )
  const classes = `min-w-0 rounded-md border border-border bg-[var(--overlay-1)] p-3 text-left sm:p-4 ${className}`
  return onDrill ? (
    <button type="button" onClick={onDrill} className={`${classes} transition-colors hover:bg-[var(--overlay-2)]`} aria-label={`${label}: see breakdown`}>
      {content}
    </button>
  ) : <div className={classes}>{content}</div>
}

function Arrow() {
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden="true">
      <span className="h-px w-10 bg-border" />
      <ArrowDown className="size-4 text-muted-foreground" />
      <span className="h-px w-10 bg-border" />
    </div>
  )
}
