import { motion } from 'framer-motion'
import { Calculator, TrendingUp, TrendingDown, IndianRupee } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'

interface TaxSummaryCardsProps {
  isLoading: boolean
  netTaxableIncome: number
  grossTaxableIncome: number
  taxAlreadyPaid: number
  isProjecting?: boolean
  prevNetTaxableIncome?: number | null
  prevGrossTaxableIncome?: number | null
  prevTaxAlreadyPaid?: number | null
}

function YoyBadge({ current, previous }: Readonly<{ current: number; previous: number | null | undefined }>) {
  if (previous == null || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  if (!Number.isFinite(pct)) return null

  const isUp = pct >= 0
  const Icon = isUp ? TrendingUp : TrendingDown
  const color = isUp ? 'text-app-green' : 'text-red-400'
  const bg = isUp ? 'bg-app-green/10' : 'bg-red-400/10'

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${color} ${bg}`}>
      <Icon className="w-3 h-3" />
      {isUp ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

export default function TaxSummaryCards({
  isLoading,
  netTaxableIncome,
  grossTaxableIncome,
  taxAlreadyPaid,
  isProjecting = false,
  prevNetTaxableIncome,
  prevGrossTaxableIncome,
  prevTaxAlreadyPaid,
}: Readonly<TaxSummaryCardsProps>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-green/20 rounded-xl">
            <TrendingUp className="w-6 h-6 text-app-green" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Salaried Income</p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-2xl font-bold">
                {isLoading ? '...' : formatCurrency(netTaxableIncome)}
              </p>
              {!isLoading && <YoyBadge current={netTaxableIncome} previous={prevNetTaxableIncome} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isProjecting ? 'Projected take-home' : 'Received after TDS'}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-blue/20 rounded-xl">
            <IndianRupee className="w-6 h-6 text-app-blue" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Taxable Income</p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-2xl font-bold">
                {isLoading ? '...' : formatCurrency(grossTaxableIncome)}
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
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/20 rounded-xl">
            <Calculator className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">
              {isProjecting ? 'Estimated Tax' : 'Tax Already Paid'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-2xl font-bold">
                {isLoading ? '...' : formatCurrency(taxAlreadyPaid)}
              </p>
              {!isLoading && <YoyBadge current={taxAlreadyPaid} previous={prevTaxAlreadyPaid} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isProjecting ? 'Projected tax liability' : 'Deducted at source'}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
