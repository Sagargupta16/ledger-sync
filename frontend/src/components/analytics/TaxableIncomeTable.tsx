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
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-4">
        Salaried Taxable Income for {selectedFY}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full" aria-label="Salaried taxable income breakdown">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Date</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Amount</th>
              <th className="hidden sm:table-cell text-left py-3 px-4 text-sm font-semibold text-foreground">
                Type
              </th>
              <th className="hidden sm:table-cell text-left py-3 px-4 text-sm font-semibold text-foreground">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {incomeGroups &&
              Object.entries(incomeGroups).map(
                ([group, data]) =>
                  data.transactions.length > 0 && (
                    <React.Fragment key={group}>
                      <tr className="border-b border-border bg-[var(--overlay-2)] hover:bg-[var(--overlay-5)] transition-colors">
                        <td className="py-3 px-4 text-left font-bold text-foreground">
                          <button
                            type="button"
                            onClick={() => toggleGroup(group)}
                            aria-expanded={expandedGroups.has(group)}
                            className="flex items-center gap-2 w-full text-left min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/40 rounded"
                          >
                            {expandedGroups.has(group) ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden />
                            )}
                            {group}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({data.transactions.length})
                            </span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-foreground tabular-nums">
                          {formatCurrency(data.total)}
                          <span className="sm:hidden block text-xs font-normal text-muted-foreground">
                            {netTaxableIncome > 0
                              ? formatPercent((data.total / netTaxableIncome) * 100)
                              : '0%'}{' '}
                            of total
                          </span>
                        </td>
                        <td
                          colSpan={2}
                          className="hidden sm:table-cell py-3 px-4 text-right font-bold text-foreground"
                        >
                          {netTaxableIncome > 0
                            ? formatPercent((data.total / netTaxableIncome) * 100)
                            : '0%'}
                        </td>
                      </tr>
                      {expandedGroups.has(group) &&
                        data.transactions.map((tx) => (
                          <motion.tr
                            key={tx.id}
                            className="border-b border-border"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <td className="py-3 pl-10 pr-4 text-foreground">
                              {new Date(tx.date).toLocaleDateString()}
                              {(tx.type || tx.note) && (
                                <span className="sm:hidden block text-xs text-muted-foreground truncate max-w-[10rem]">
                                  {[tx.type, tx.note].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums">
                              {group === 'EPF' ? (
                                <div>
                                  <div className="font-bold text-app-green">
                                    {formatCurrency(tx.amount / 2)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    (50% of {formatCurrency(tx.amount)})
                                  </div>
                                </div>
                              ) : (
                                <span className="font-bold text-app-green">
                                  {formatCurrency(tx.amount)}
                                </span>
                              )}
                            </td>
                            <td className="hidden sm:table-cell py-3 px-4 text-foreground">{tx.type}</td>
                            <td className="hidden sm:table-cell py-3 px-4 text-foreground">{tx.note}</td>
                          </motion.tr>
                        ))}
                    </React.Fragment>
                  ),
              )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
