import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

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
                      <tr
                        className="border-b border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                        onClick={() => toggleGroup(group)}
                      >
                        <td colSpan={2} className="py-3 px-4 text-left font-bold text-white">
                          <div className="flex items-center gap-2">
                            {expandedGroups.has(group) ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                            {group}
                            <span className="text-xs font-normal text-gray-400">
                              ({data.transactions.length})
                            </span>
                          </div>
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
                      {expandedGroups.has(group) &&
                        data.transactions.map((tx) => (
                          <motion.tr
                            key={tx.id}
                            className="border-b border-white/5"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <td className="py-3 pl-10 pr-4 text-white">
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
                          </motion.tr>
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
