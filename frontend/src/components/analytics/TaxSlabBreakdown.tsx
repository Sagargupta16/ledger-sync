import { motion } from 'framer-motion'
import { formatCurrency } from '@/lib/formatters'
import type { TaxSlab, SlabBreakdownEntry } from '@/lib/taxCalculator'

interface TaxSlabBreakdownProps {
  isNewRegime: boolean
  taxSlabs: TaxSlab[]
  slabBreakdown: SlabBreakdownEntry[]
  grossTaxableIncome: number
  standardDeduction: number
  fyYear: number
  baseTax: number
  cess: number
  professionalTax: number
  totalTax: number
}

export default function TaxSlabBreakdown({
  isNewRegime,
  taxSlabs,
  slabBreakdown,
  grossTaxableIncome,
  standardDeduction,
  fyYear,
  baseTax,
  cess,
  professionalTax,
  totalTax,
}: Readonly<TaxSlabBreakdownProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="glass rounded-xl border border-white/10 p-6 shadow-lg"
    >
      <h3 className="text-xl font-semibold text-white mb-4">
        {isNewRegime ? 'Tax Slabs (FY 2025-26 Onwards)' : 'Tax Slabs (Before FY 2025-26)'}
      </h3>

      {/* Standard Deduction Info */}
      <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-400">
          Standard Deduction:{' '}
          <span className="font-semibold">{formatCurrency(standardDeduction)}</span>
          {fyYear >= 2024 ? ' (from FY 2024-25)' : ' (before FY 2024-25)'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Tax calculated on: {formatCurrency(grossTaxableIncome)} (After standard deduction)
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">
                Lower Limit
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">
                Upper Limit
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Tax %</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">
                Tax Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {taxSlabs.map((slab) => {
              const breakdown = slabBreakdown.find((b) => b.slab === slab)
              const taxAmount = breakdown?.taxAmount || 0
              const isApplicable = grossTaxableIncome > slab.lower

              return (
                <tr
                  key={`${slab.lower}-${slab.upper}`}
                  className={`border-b border-white/5 ${isApplicable ? 'bg-primary/5' : ''}`}
                >
                  <td className="py-3 px-4 text-white">{formatCurrency(slab.lower)}</td>
                  <td className="py-3 px-4 text-white">
                    {slab.upper === Infinity ? 'Above' : formatCurrency(slab.upper)}
                  </td>
                  <td className="py-3 px-4 text-right text-white font-semibold">
                    {slab.rate.toFixed(2)}%
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-primary">
                    {isApplicable ? formatCurrency(taxAmount) : formatCurrency(0)}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t border-white/10">
              <td colSpan={3} className="py-3 px-4 text-right font-semibold text-white">
                Tax on Base:
              </td>
              <td className="py-3 px-4 text-right font-bold text-white">
                {formatCurrency(baseTax)}
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <td colSpan={3} className="py-3 px-4 text-right text-sm text-gray-400">
                + Health & Education Cess (4%):
              </td>
              <td className="py-3 px-4 text-right text-sm text-gray-300">
                {formatCurrency(cess)}
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <td colSpan={3} className="py-3 px-4 text-right text-sm text-gray-400">
                + Professional Tax:
              </td>
              <td className="py-3 px-4 text-right text-sm text-gray-300">
                {formatCurrency(professionalTax)}
              </td>
            </tr>
            <tr className="border-t-2 border-primary/30">
              <td colSpan={3} className="py-4 px-4 text-right text-lg font-bold text-white">
                Total Tax Already Paid:
              </td>
              <td className="py-4 px-4 text-right text-2xl font-bold text-primary">
                {formatCurrency(totalTax)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
