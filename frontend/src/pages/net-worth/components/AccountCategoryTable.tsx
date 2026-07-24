import { useState } from 'react'

import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import ProgressBar from '@/components/shared/ProgressBar'
import { Money } from '@/components/ui'
import { formatPercent } from '@/lib/formatters'

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
      <span className="whitespace-nowrap tabular-nums">
        {ratio === null ? 'n/a' : formatPercent(ratio)}
      </span>
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
  /** Accounts the user marked closed -- shown with a badge, still listed while
   *  the balance is nonzero (a closed card with unpaid dues is still a liability). */
  readonly closedAccounts?: readonly string[]
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
  closedAccounts = [],
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
    <section
      className="overflow-x-auto"
      aria-label="Accounts by category"
    >
      <table className="w-full">
        <caption className="sr-only">
          Accounts grouped by category with balances, allocation percentages, and transaction
          counts
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground"
            >
              Account
            </th>
            <th
              scope="col"
              aria-sort={ariaSort(sortKey, 'balance', sortDir)}
              className="text-right py-1 px-2 text-sm font-semibold text-muted-foreground"
            >
              <button
                type="button"
                onClick={() => toggleSort('balance')}
                aria-label={`Sort accounts by balance ${
                  sortKey === 'balance' && sortDir === 'desc' ? 'ascending' : 'descending'
                }`}
                className="ml-auto flex min-h-11 items-center justify-end gap-1 rounded px-2 select-none hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                Balance
                {sortKey === 'balance' && (
                  <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
            </th>
            <th
              scope="col"
              className="hidden sm:table-cell text-right py-3 px-4 text-sm font-semibold text-muted-foreground"
            >
              % Allocated
            </th>
            <th
              scope="col"
              className="hidden sm:table-cell text-right py-3 px-4 text-sm font-semibold text-muted-foreground"
            >
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
                    const catAllocation = allocationRatio(catBalance, total)

                    acc.elements.push(
                      <tr
                        key={`header-${currentCategory}`}
                        className="bg-[var(--overlay-2)] hover:bg-[var(--overlay-5)] transition-colors"
                      >
                        <th
                          scope="row"
                          className="py-2 px-4 text-left text-sm font-semibold text-primary"
                        >
                          <button
                            type="button"
                            onClick={() => onToggleCategory(currentCategory)}
                            aria-expanded={expandedCategories.has(currentCategory)}
                            aria-label={`${expandedCategories.has(currentCategory) ? 'Collapse' : 'Expand'} ${currentCategory} accounts`}
                            className="flex min-h-11 w-full items-center gap-2 rounded bg-transparent border-none p-0 text-left font-inherit text-inherit cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                          >
                            {expandedCategories.has(currentCategory) ? (
                              <ChevronDown className="size-4 shrink-0" aria-hidden />
                            ) : (
                              <ChevronRight className="size-4 shrink-0" aria-hidden />
                            )}
                            <span className="min-w-0 break-words">
                              {currentCategory}
                              <span className="ml-1 text-xs text-text-tertiary font-normal">
                                ({categoryAccounts.length})
                              </span>
                            </span>
                          </button>
                          <span className="block sm:hidden text-xs font-normal text-text-tertiary">
                            {catAllocation === null
                              ? 'Allocation n/a'
                              : `${formatPercent(catAllocation)} allocated`}
                            {' / '}
                            {catTransactions} transactions
                          </span>
                        </th>
                        <td className="py-2 px-4 text-right text-sm">
                          <Money value={catBalance} className={headerBalanceColorClass} />
                        </td>
                        <td className="hidden sm:table-cell py-2 px-4 text-right text-sm font-medium text-muted-foreground/70">
                          <AllocationCell balance={catBalance} total={total} barColor={barColor} />
                        </td>
                        <td className="hidden sm:table-cell py-2 px-4 text-right text-sm font-medium text-muted-foreground/70 tabular-nums">
                          {catTransactions}
                        </td>
                      </tr>,
                    )
                  }

                  if (expandedCategories.has(currentCategory)) {
                    const accountBalance = Math.abs(accountData.balance)
                    const accountAllocation = allocationRatio(accountBalance, total)
                    acc.elements.push(
                      <motion.tr
                        key={accountName}
                        className="border-b border-border hover:bg-[var(--overlay-5)] transition-colors"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <th
                          scope="row"
                          className="py-3 pl-10 pr-4 text-left text-foreground font-medium"
                        >
                          <span className="inline-flex max-w-full items-center gap-2 break-words">
                            {accountName}
                            {closedAccounts.includes(accountName) && (
                              <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[var(--overlay-5)] text-muted-foreground">
                                Closed
                              </span>
                            )}
                          </span>
                          <span className="block sm:hidden text-xs font-normal text-text-tertiary">
                            {accountAllocation === null
                              ? 'Allocation n/a'
                              : `${formatPercent(accountAllocation)} allocated`}
                            {' / '}
                            {accountData.transactions} transactions
                          </span>
                        </th>
                        <td className="py-3 px-4 text-right">
                          <Money value={accountBalance} bold className={balanceColorClass} />
                        </td>
                        <td className="hidden sm:table-cell py-3 px-4 text-right text-muted-foreground">
                          <AllocationCell
                            balance={accountBalance}
                            total={total}
                            barColor={barColor}
                          />
                        </td>
                        <td className="hidden sm:table-cell py-3 px-4 text-right text-muted-foreground tabular-nums">
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
    </section>
  )
}
