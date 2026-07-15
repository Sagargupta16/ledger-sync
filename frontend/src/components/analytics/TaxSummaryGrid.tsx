import { motion } from 'framer-motion'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { ProgressBar } from '@/components/shared'
import { hexToRgba, rawColors } from '@/constants/colors'

interface TaxSummaryGridProps {
  selectedFY: string
  grossTaxableIncome: number
  taxAlreadyPaid: number
  totalIncome: number
  totalExpense: number
  isProjecting?: boolean
}

export default function TaxSummaryGrid({
  selectedFY,
  grossTaxableIncome,
  taxAlreadyPaid,
  totalIncome,
  totalExpense,
  isProjecting = false,
}: Readonly<TaxSummaryGridProps>) {
  const effectiveTaxRate =
    grossTaxableIncome > 0 ? (taxAlreadyPaid / grossTaxableIncome) * 100 : 0

  const netSavings = totalIncome - totalExpense
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <h3 className="text-lg font-semibold text-foreground mb-6">Tax Summary for {selectedFY}</h3>
      <div className={`grid grid-cols-1 ${isProjecting ? '' : 'sm:grid-cols-2'} gap-4`}>
        <div className="p-4 bg-[var(--overlay-2)] rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2">Effective Tax Rate</p>
          <p className="text-2xl font-bold text-primary">{formatPercent(effectiveTaxRate)}</p>
          {/* Qualitative bands frame whether the rate is light/moderate/heavy
              against the new-regime ceiling (~30% slab + cess). The fill shows
              where this FY lands; the tick marks the 30% top-slab threshold. */}
          <ProgressBar
            value={effectiveTaxRate}
            max={35}
            target={30}
            height={6}
            color={rawColors.app.orange}
            bands={[
              { upTo: (15 / 35) * 100, color: hexToRgba(rawColors.app.green, 0.1) },
              { upTo: (25 / 35) * 100, color: hexToRgba(rawColors.app.orange, 0.1) },
              { upTo: 100, color: hexToRgba(rawColors.app.red, 0.1) },
            ]}
            ariaLabel={`Effective tax rate ${formatPercent(effectiveTaxRate)} of gross taxable income`}
            className="mt-3"
          />
          <p className="text-overline text-text-tertiary mt-2">
            {formatCurrency(taxAlreadyPaid)} on {formatCurrency(grossTaxableIncome)} gross
          </p>
        </div>
        {!isProjecting && (
          <div className="p-4 bg-[var(--overlay-2)] rounded-lg border border-border">
            <p className="text-sm text-muted-foreground mb-2">Net Savings</p>
            <p className="text-2xl font-bold text-app-purple">{formatCurrency(netSavings)}</p>
            {/* Savings rate = kept / earned. Bands echo the common 20% / 30%
                personal-finance guideposts so the bar reads as good/great. */}
            <ProgressBar
              value={savingsRate}
              max={100}
              target={20}
              height={6}
              color={rawColors.app.purple}
              bands={[
                { upTo: 20, color: hexToRgba(rawColors.app.red, 0.1) },
                { upTo: 30, color: hexToRgba(rawColors.app.orange, 0.1) },
                { upTo: 100, color: hexToRgba(rawColors.app.green, 0.1) },
              ]}
              ariaLabel={`Savings rate ${formatPercent(savingsRate)} of total income`}
              className="mt-3"
            />
            <p className="text-overline text-text-tertiary mt-2">
              {formatPercent(savingsRate)} of {formatCurrency(totalIncome)} income kept
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
