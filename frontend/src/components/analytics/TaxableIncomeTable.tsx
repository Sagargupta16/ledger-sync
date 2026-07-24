import React, { useState } from 'react'

import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { Money } from '@/components/ui'
import { formatPercent } from '@/lib/formatters'
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
      <section
        className="overflow-x-auto"
        aria-label={`Salaried taxable income for ${selectedFY}`}
      >
        <table className="w-full">
          <caption className="sr-only">
            Salaried taxable income transactions grouped by source for {selectedFY}
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="text-left py-3 px-4 text-sm font-semibold text-foreground"
              >
                Date
              </th>
              <th
                scope="col"
                className="text-right py-3 px-4 text-sm font-semibold text-foreground"
              >
                Amount
              </th>
              <th
                scope="col"
                className="hidden sm:table-cell text-left py-3 px-4 text-sm font-semibold text-foreground"
              >
                Type
              </th>
              <th
                scope="col"
                className="hidden sm:table-cell text-left py-3 px-4 text-sm font-semibold text-foreground"
              >
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
                        <th
                          scope="row"
                          className="py-3 px-4 text-left font-bold text-foreground"
                        >
                          <button
                            type="button"
                            onClick={() => toggleGroup(group)}
                            aria-expanded={expandedGroups.has(group)}
                            aria-label={`${expandedGroups.has(group) ? 'Collapse' : 'Expand'} ${group} income transactions`}
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
                        </th>
                        <td className="py-3 px-4 text-right font-bold text-foreground tabular-nums whitespace-nowrap">
                          <Money value={data.total} bold />
                          <span className="sm:hidden block text-xs font-normal text-muted-foreground">
                            {netTaxableIncome > 0
                              ? formatPercent((data.total / netTaxableIncome) * 100)
                              : '0%'}{' '}
                            of total
                          </span>
                        </td>
                        <td
                          colSpan={2}
                          className="hidden sm:table-cell py-3 px-4 text-right font-bold text-foreground tabular-nums whitespace-nowrap"
                        >
                          <span className="sr-only">Share of total taxable income: </span>
                          {netTaxableIncome > 0
                            ? formatPercent((data.total / netTaxableIncome) * 100)
                            : '0%'}{' '}
                          of total
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
                            <th
                              scope="row"
                              className="py-3 pl-10 pr-4 text-left font-normal text-foreground whitespace-nowrap"
                            >
                              {new Date(tx.date).toLocaleDateString()}
                              {(tx.type || tx.note) && (
                                <span className="sm:hidden block max-w-[12rem] whitespace-normal break-words text-xs text-muted-foreground">
                                  {[tx.type, tx.note].filter(Boolean).join(' / ')}
                                </span>
                              )}
                            </th>
                            <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                              {group === 'EPF' ? (
                                <div>
                                  <Money
                                    value={tx.amount / 2}
                                    bold
                                    className="text-app-green"
                                  />
                                  <div className="text-xs text-muted-foreground">
                                    (50% of{' '}
                                    <Money
                                      value={tx.amount}
                                      className="inline font-normal text-muted-foreground"
                                    />
                                    )
                                  </div>
                                </div>
                              ) : (
                                <Money value={tx.amount} bold className="text-app-green" />
                              )}
                            </td>
                            <td className="hidden sm:table-cell py-3 px-4 text-foreground">
                              {tx.type}
                            </td>
                            <td className="hidden sm:table-cell py-3 px-4 text-foreground break-words">
                              {tx.note}
                            </td>
                          </motion.tr>
                        ))}
                    </React.Fragment>
                  ),
              )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
