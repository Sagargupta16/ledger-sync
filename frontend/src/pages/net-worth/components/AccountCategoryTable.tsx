import { useState } from 'react'

import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import ProgressBar from '@/components/shared/ProgressBar'
import { formatCurrency, formatPercent } from '@/lib/formatters'

import { ariaSort } from '../netWorthUtils'

/** Raw allocation percent (0-100), or null when the total is zero/invalid. */
function allocationRatio(balance: number, total: number): number | null {
  if (!total) return null
  return (balance / total) * 100
}

/**
 * "% Allocated" cell: the number plus an inline mini-bar so each row's share
 * of the total reads at a glance. Reuses the shared ProgressBar primitive
 * rather than a hand-rolled fill div. `barColor` matches the asset/liability
 * semantic so green vs red carries through to the bars.
 */
function AllocationCell({
  balance,
  total,
  barColor,
}: Readonly<{ balance: number; total: number; barColor: string }>) {
  const ratio = allocationRatio(balance, total)
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums">{ratio === null ? 'n/a' : formatPercent(ratio)}</span>
      {ratio !== null && (
        <ProgressBar
          value={ratio}
          color={barColor}
          height={6}
          className="w-16 hidden sm:block"
          ariaLabel={`${formatPercent(ratio)} of total`}
        />
      )}
    </div>
  )
}

interface AccountCategoryTableProps {
  readonly accounts: Record<string, { balance: number; transactions: number }>
  readonly filterFn: (balance: number) => boolean
  readonly total: number
  readonly balanceColorClass: string
  readonly headerBalanceColorClass: string
  /** Raw token color for the inline allocation mini-bars (green/red). */
  readonly barColor: string
  readonly expandedCategories: Set<string>
  readonly onToggleCategory: (category: string) => void
  readonly getAccountType: (name: string) => string
  readonly emptyIcon: LucideIcon
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly isLoading: boolean
}

export function AccountCategoryTable({
  accounts,
  filterFn,
  total,
  balanceColorClass,
  headerBalanceColorClass,
  barColor,
  expandedCategories,
  onToggleCategory,
  getAccountType,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  isLoading,
}: AccountCategoryTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (isLoading) {
    return <TableSkeleton />
  }

  const hasAccounts = Object.keys(accounts).some((name) => filterFn(accounts[name].balance))

  if (!hasAccounts) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        variant="compact"
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
              Account
            </th>
            <th
              onClick={() => toggleSort('balance')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleSort('balance')
                }
              }}
              tabIndex={0}
              aria-sort={ariaSort(sortKey, 'balance', sortDir)}
              className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none"
            >
              Balance {sortKey === 'balance' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
              % Allocated
            </th>
            <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
              Type
            </th>
            <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
              Transactions
            </th>
          </tr>
        </thead>
        <tbody>
          {
            Object.entries(accounts)
              .filter(
                ([, accountData]) =>
                  filterFn(accountData.balance) && Math.abs(accountData.balance) >= 0.01,
              )
              .sort((a, b) => {
                if (sortKey === 'balance') {
                  const cmp = Math.abs(a[1].balance) - Math.abs(b[1].balance)
                  return sortDir === 'asc' ? cmp : -cmp
                }
                const catA = getAccountType(a[0])
                const catB = getAccountType(b[0])
                if (catA !== catB) return catA.localeCompare(catB)
                return Math.abs(b[1].balance) - Math.abs(a[1].balance)
              })
              .reduce(
                (acc, [accountName, accountData], index, array) => {
                  const currentCategory = getAccountType(accountName)
                  const prevCategory = index > 0 ? getAccountType(array[index - 1][0]) : null
                  const showCategoryHeader = currentCategory !== prevCategory

                  if (!acc.categoryTotals[currentCategory]) {
                    acc.categoryTotals[currentCategory] = { balance: 0, transactions: 0 }
                  }
                  acc.categoryTotals[currentCategory].balance += Math.abs(accountData.balance)
                  acc.categoryTotals[currentCategory].transactions += accountData.transactions

                  if (showCategoryHeader) {
                    const categoryAccounts = array.filter(
                      ([name]) => getAccountType(name) === currentCategory,
                    )
                    const catBalance = categoryAccounts.reduce(
                      (sum, [, data]) => sum + Math.abs(data.balance),
                      0,
                    )
                    const catTransactions = categoryAccounts.reduce(
                      (sum, [, data]) => sum + data.transactions,
                      0,
                    )

                    acc.elements.push(
                      <tr
                        key={`header-${currentCategory}`}
                        className="bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <td className="py-2 px-4 text-sm font-semibold text-primary">
                          <button
                            type="button"
                            onClick={() => onToggleCategory(currentCategory)}
                            aria-expanded={expandedCategories.has(currentCategory)}
                            className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer text-inherit font-inherit p-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/40"
                          >
                            {expandedCategories.has(currentCategory) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            {currentCategory}
                            <span className="text-xs text-text-tertiary font-normal">
                              ({categoryAccounts.length})
                            </span>
                          </button>
                        </td>
                        <td
                          className={`py-2 px-4 text-right text-sm font-medium ${headerBalanceColorClass}`}
                        >
                          {formatCurrency(catBalance)}
                        </td>
                        <td className="py-2 px-4 text-right text-sm font-medium text-muted-foreground/70">
                          <AllocationCell balance={catBalance} total={total} barColor={barColor} />
                        </td>
                        <td className="py-2 px-4 text-right text-sm font-medium text-muted-foreground/70">
                          n/a
                        </td>
                        <td className="py-2 px-4 text-right text-sm font-medium text-muted-foreground/70">
                          {catTransactions}
                        </td>
                      </tr>,
                    )
                  }

                  if (expandedCategories.has(currentCategory)) {
                    acc.elements.push(
                      <motion.tr
                        key={accountName}
                        className="border-b border-border hover:bg-white/10 transition-colors"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <td className="py-3 pl-10 pr-4 text-white font-medium">{accountName}</td>
                        <td className={`py-3 px-4 text-right font-bold ${balanceColorClass}`}>
                          {formatCurrency(Math.abs(accountData.balance))}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          <AllocationCell
                            balance={Math.abs(accountData.balance)}
                            total={total}
                            barColor={barColor}
                          />
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          {getAccountType(accountName)}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          {accountData.transactions}
                        </td>
                      </motion.tr>,
                    )
                  }

                  return acc
                },
                {
                  elements: [] as React.ReactNode[],
                  categoryTotals: {} as Record<
                    string,
                    { balance: number; transactions: number }
                  >,
                },
              ).elements
          }
        </tbody>
      </table>
    </div>
  )
}
