import { motion } from 'motion/react'
import { Calculator, TrendingUp, TrendingDown, IndianRupee } from 'lucide-react'
import { Money } from '@/components/ui'
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="ledger-panel min-w-0 p-4 sm:p-5"
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-app-green/15">
            <TrendingUp className="size-4 text-app-green" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-kpi-label text-muted-foreground">
              {isProjecting ? 'Cash take-home' : 'Income after estimated tax'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="ledger-figure text-kpi-hero font-semibold">
                {isLoading ? '...' : <Money value={netTaxableIncome} compactBelowSm bold className="whitespace-normal text-left" />}
              </p>
              {!isLoading && <YoyBadge current={netTaxableIncome} previous={prevNetTaxableIncome} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isProjecting ? 'Employment payroll after tax and employee EPF' : 'After estimated tax and known employee deductions'}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="ledger-panel min-w-0 p-4 sm:p-5"
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-app-blue/15">
            <IndianRupee className="size-4 text-app-blue" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-kpi-label text-muted-foreground">Taxable Income</p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="ledger-figure text-kpi-hero font-semibold">
                {isLoading ? '...' : <Money value={grossTaxableIncome} compactBelowSm bold className="whitespace-normal text-left" />}
              </p>
              {!isLoading && <YoyBadge current={grossTaxableIncome} previous={prevGrossTaxableIncome} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Before standard deduction</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="ledger-panel col-span-2 min-w-0 p-4 sm:col-span-1 sm:p-5"
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15">
            <Calculator className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-kpi-label text-muted-foreground">
              {isProjecting ? 'Estimated annual tax liability' : 'Tax on recorded income'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="ledger-figure text-kpi-hero font-semibold">
                {isLoading ? '...' : <Money value={totalTax} compactBelowSm bold className="whitespace-normal text-left" />}
              </p>
              {!isLoading && <YoyBadge current={totalTax} previous={prevTotalTax} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isProjecting ? 'Full-year employment and other recorded taxable income' : 'Liability if no further taxable income is received this FY'}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
