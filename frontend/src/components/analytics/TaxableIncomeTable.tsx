import React from 'react'
import { motion } from 'framer-motion'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import type { Transaction } from '@/types'

interface IncomeGroup {
  total: number
  transactions: Transaction[]
}

interface TaxableIncomeTableProps {
  selectedFY: string
  incomeGroups: Record<string, IncomeGroup> | undefined
  netTaxableIncome: number
}

export default function TaxableIncomeTable({
  selectedFY,
  incomeGroups,
  netTaxableIncome,
}: Readonly<TaxableIncomeTableProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
      className="glass rounded-xl border border-white/10 p-6 shadow-lg"
    >
      <h3 className="text-lg font-semibold text-white mb-6">
        Salaried Taxable Income for {selectedFY}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Date</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Amount</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Type</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Note</th>
            </tr>
          </thead>
          <tbody>
            {incomeGroups &&
              Object.entries(incomeGroups).map(
                ([group, data]) =>
                  data.transactions.length > 0 && (
                    <React.Fragment key={group}>
                      <tr className="border-b border-white/10 bg-white/5">
                        <td colSpan={2} className="py-3 px-4 text-left font-bold text-white">
                          {group}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-white">
                          {formatCurrency(data.total)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-white">
                          {netTaxableIncome > 0
                            ? formatPercent((data.total / netTaxableIncome) * 100)
                            : '0%'}
                        </td>
                      </tr>
                      {data.transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-white/5">
                          <td className="py-3 px-4 text-white">
                            {new Date(tx.date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {group === 'EPF' ? (
                              <div>
                                <div className="font-bold text-green-400">
                                  {formatCurrency(tx.amount / 2)}
                                </div>
                                <div className="text-xs text-gray-400">
                                  (50% of {formatCurrency(tx.amount)})
                                </div>
                              </div>
                            ) : (
                              <span className="font-bold text-green-400">
                                {formatCurrency(tx.amount)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-white">{tx.type}</td>
                          <td className="py-3 px-4 text-white">{tx.note}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ),
              )}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
