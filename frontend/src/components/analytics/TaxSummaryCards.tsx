import { motion } from 'framer-motion'
import { Calculator, TrendingUp, IndianRupee } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'

interface TaxSummaryCardsProps {
  isLoading: boolean
  netTaxableIncome: number
  grossTaxableIncome: number
  taxAlreadyPaid: number
}

export default function TaxSummaryCards({
  isLoading,
  netTaxableIncome,
  grossTaxableIncome,
  taxAlreadyPaid,
}: Readonly<TaxSummaryCardsProps>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-xl border border-border p-6 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-ios-green/20 rounded-xl shadow-lg shadow-ios-green/30">
            <TrendingUp className="w-6 h-6 text-ios-green" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Salaried Income</p>
            <p className="text-2xl font-bold">
              {isLoading ? '...' : formatCurrency(netTaxableIncome)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Received after TDS</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-xl border border-border p-6 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-ios-blue/20 rounded-xl shadow-lg shadow-ios-blue/30">
            <IndianRupee className="w-6 h-6 text-ios-blue" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Taxable Income</p>
            <p className="text-2xl font-bold">
              {isLoading ? '...' : formatCurrency(grossTaxableIncome)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Before standard deduction</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-xl border border-border p-6 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
            <Calculator className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Tax Already Paid</p>
            <p className="text-2xl font-bold">
              {isLoading ? '...' : formatCurrency(taxAlreadyPaid)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Deducted at source</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
