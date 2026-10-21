import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Calculator, TrendingUp, TrendingDown, IndianRupee, type LucideIcon } from 'lucide-react'
import { Money } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatPercent, percentChange } from '@/lib/formatters'

interface TaxSummaryCardsProps {
  isLoading: boolean
  netTaxableIncome: number
  grossTaxableIncome: number
  totalTax: number
  isProjecting?: boolean
  prevNetTaxableIncome?: number | null
  prevGrossTaxableIncome?: number | null
  prevTotalTax?: number | null
}

function YoyBadge({ current, previous }: Readonly<{ current: number; previous: number | null | undefined }>) {
  if (previous == null || previous === 0) return null
  const pct = percentChange(current, previous)
  if (pct === null || !Number.isFinite(pct)) return null

  const isUp = pct >= 0
  const Icon = isUp ? TrendingUp : TrendingDown
  const color = isUp ? 'text-app-green' : 'text-app-red'
  const bg = isUp ? 'bg-app-green/10' : 'bg-app-red/10'

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-overline font-medium ${color} ${bg}`}>
      <Icon className="w-3 h-3" />
      {formatPercent(pct, true)}
    </span>
  )
}

function TaxSummaryTile({
  icon: Icon,
  iconClassName,
  iconBackgroundClassName,
  label,
  value,
  previous,
  note,
  delay,
  isLoading,
  className,
}: Readonly<{
  icon: LucideIcon
  iconClassName: string
  iconBackgroundClassName: string
  label: ReactNode
  value: number
  previous: number | null | undefined
  note: ReactNode
  delay: number
  isLoading: boolean
  className?: string
}>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn('ledger-panel min-w-0 p-4 sm:p-5', className)}
    >
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', iconBackgroundClassName)}>
          <Icon className={cn('size-4', iconClassName)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-kpi-label text-muted-foreground">{label}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="ledger-figure text-kpi-hero font-semibold">
              {isLoading ? '...' : <Money value={value} compactBelowSm bold className="whitespace-normal text-left" />}
            </p>
            {!isLoading && <YoyBadge current={value} previous={previous} />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{note}</p>
        </div>
      </div>
    </motion.div>
  )
}

export default function TaxSummaryCards({
  isLoading,
  netTaxableIncome,
  grossTaxableIncome,
  totalTax,
  isProjecting = false,
  prevNetTaxableIncome,
  prevGrossTaxableIncome,
  prevTotalTax,
}: Readonly<TaxSummaryCardsProps>) {
  return (
    // Two-up on phones with short figures; full figures from `sm` up.
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <TaxSummaryTile
        icon={TrendingUp}
        iconClassName="text-app-green"
        iconBackgroundClassName="bg-app-green/15"
        label={isProjecting ? 'Cash take-home' : 'Income after estimated tax'}
        value={netTaxableIncome}
        previous={prevNetTaxableIncome}
        note={isProjecting ? 'Employment payroll after tax and employee EPF' : 'After estimated tax and known employee deductions'}
        delay={0.1}
        isLoading={isLoading}
      />
      <TaxSummaryTile
        icon={IndianRupee}
        iconClassName="text-app-blue"
        iconBackgroundClassName="bg-app-blue/15"
        label="Taxable Income"
        value={grossTaxableIncome}
        previous={prevGrossTaxableIncome}
        note="Before standard deduction"
        delay={0.2}
        isLoading={isLoading}
      />
      <TaxSummaryTile
        icon={Calculator}
        iconClassName="text-primary"
        iconBackgroundClassName="bg-primary/15"
        label={isProjecting ? 'Estimated annual tax liability' : 'Tax on recorded income'}
        value={totalTax}
        previous={prevTotalTax}
        note={isProjecting ? 'Full-year employment and other recorded taxable income' : 'Liability if no further taxable income is received this FY'}
        delay={0.3}
        isLoading={isLoading}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  )
}
