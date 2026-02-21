import { motion } from 'framer-motion'
import { formatCurrency, formatPercent } from '@/lib/formatters'

interface TaxSummaryGridProps {
  selectedFY: string
  grossTaxableIncome: number
  taxAlreadyPaid: number
  netTaxableIncome: number
  totalIncome: number
  totalExpense: number
}

export default function TaxSummaryGrid({
  selectedFY,
  grossTaxableIncome,
  taxAlreadyPaid,
  netTaxableIncome,
  totalIncome,
  totalExpense,
}: Readonly<TaxSummaryGridProps>) {
  const effectiveTaxRate =
    grossTaxableIncome > 0 ? (taxAlreadyPaid / grossTaxableIncome) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="glass rounded-xl border border-border p-6 shadow-lg"
    >
      <h3 className="text-lg font-semibold text-white mb-6">Tax Summary for {selectedFY}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white/5 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2">Effective Tax Rate</p>
          <p className="text-2xl font-bold text-primary">{formatPercent(effectiveTaxRate)}</p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2">Gross Taxable Income</p>
          <p className="text-2xl font-bold text-ios-blue">
            {formatCurrency(grossTaxableIncome)}
          </p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2">Net Received (After Tax)</p>
          <p className="text-2xl font-bold text-ios-green">
            {formatCurrency(netTaxableIncome)}
          </p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2">Net Savings</p>
          <p className="text-2xl font-bold text-ios-purple">
            {formatCurrency(totalIncome - totalExpense)}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
