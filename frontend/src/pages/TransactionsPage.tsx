import { useState, useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download, Receipt } from 'lucide-react'
import type { SortingState } from '@tanstack/react-table'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/ui'
import TransactionTable from '@/components/transactions/TransactionTable'
import TransactionFilters, { type FilterValues } from '@/components/transactions/TransactionFilters'
import SavedViewsMenu from '@/components/transactions/SavedViewsMenu'
import Pagination from '@/components/transactions/Pagination'
import { useTransactionFacets } from '@/hooks/api/useTransactions'
import { transactionsService, type TransactionFilters as ServiceFilters } from '@/services/api/transactions'

/** Map component filter + sorting state to API query params */
function buildServerFilters(
  filters: FilterValues,
  sorting: SortingState,
  currentPage: number,
  itemsPerPage: number,
): ServiceFilters {
  const sortField = sorting[0]?.id ?? 'date'
  const sortOrder: 'asc' | 'desc' = (sorting[0]?.desc ?? true) ? 'desc' : 'asc'

  return {
    query: filters.query || undefined,
    category: filters.category || undefined,
    account: filters.account || undefined,
    type: filters.type || undefined,
    tag: filters.tag || undefined,
    min_amount: filters.min_amount,
    max_amount: filters.max_amount,
    start_date: filters.start_date || undefined,
    end_date: filters.end_date || undefined,
    sort: sortField,
    sort_order: sortOrder,
    limit: itemsPerPage,
    offset: (currentPage - 1) * itemsPerPage,
  }
}

export default function TransactionsPage() {
  const [filters, setFilters] = useState<FilterValues>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [isExporting, setIsExporting] = useState(false)
  // Bumped on each saved-view apply to remount TransactionFilters, which
  // re-seeds its internal state from initialValues.
  const [filtersVersion, setFiltersVersion] = useState(0)

  // Build server-side filter params from current UI state
  const serverFilters = useMemo(
    () => buildServerFilters(filters, sorting, currentPage, itemsPerPage),
    [filters, sorting, currentPage, itemsPerPage],
  )

  // Dropdown options + per-type counts, aggregated server-side (no full-ledger
  // fetch). categories/accounts feed the filter dropdowns; the counts feed the
  // summary card.
  const { data: facets } = useTransactionFacets()
  const categories = facets?.categories ?? []
  const accounts = facets?.accounts ?? []
  const typeCounts = {
    income: facets?.income_count ?? 0,
    expense: facets?.expense_count ?? 0,
    transfer: facets?.transfer_count ?? 0,
  }

  // Fetch filtered + sorted + paginated rows from the server. The response
  // carries the filtered total, so no separate count query is needed.
  const { data: page, isLoading } = useQuery({
    queryKey: ['transactions-page', serverFilters],
    queryFn: () => transactionsService.getTransactionsPaginated(serverFilters),
    staleTime: Infinity,
  })
  const filteredTransactions = page?.data ?? []
  const total = page?.total ?? facets?.total_count ?? 0
  const unfilteredTotal = facets?.total_count ?? 0
  // When filters narrow the result set, show "X of Y" so the card doesn't
  // contradict the filtered count shown in pagination.
  const isFiltered = total !== unfilteredTotal

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters)
    setCurrentPage(1) // Reset to first page when filters change
  }

  const handleApplyView = (viewFilters: FilterValues) => {
    setFilters(viewFilters)
    setCurrentPage(1)
    setFiltersVersion((v) => v + 1)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items)
    setCurrentPage(1)
  }

  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      const blob = await transactionsService.exportToCSV(filters)
      const url = globalThis.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Defer URL revocation so the browser has time to start the download
      setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000)
      toast.success('Export successful!', {
        description: 'Your transactions have been exported to CSV',
      })
    } catch {
      toast.error('Export failed', {
        description: 'Failed to export transactions. Please try again.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <PageContainer>
        {/* Header */}
        <PageHeader
          title="Transactions"
          subtitle="Browse and search your transaction history"
          action={
            <motion.button
              onClick={handleExportCSV}
              whileTap={{ scale: 0.97 }}
              disabled={isExporting || filteredTransactions.length === 0}
              aria-disabled={isExporting || filteredTransactions.length === 0}
              title={filteredTransactions.length === 0 ? 'No transactions to export' : undefined}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-secondary text-on-accent rounded-lg hover:shadow-lg hover:shadow-primary/50 transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
              <span className="text-sm font-medium">{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </motion.button>
          }
        />

        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl border border-border p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl">
                <Receipt className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isFiltered ? 'Matching Transactions' : 'Total Transactions'}</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">
                  {total.toLocaleString('en-IN')}
                  {isFiltered && (
                    <span className="text-base font-medium text-muted-foreground"> of {unfilteredTotal.toLocaleString('en-IN')}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-6 sm:gap-10">
                <div>
                  <p className="text-sm text-muted-foreground">Income</p>
                  <p className="text-xl font-semibold tabular-nums text-app-green">{typeCounts.income.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expense</p>
                  <p className="text-xl font-semibold tabular-nums text-app-red">{typeCounts.expense.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transfer</p>
                  <p className="text-xl font-semibold tabular-nums text-app-teal">{typeCounts.transfer.toLocaleString('en-IN')}</p>
                </div>
              </div>
              {/* Type mix as a 100% stacked bar -- the proportional split the
                  three counts above imply, without a separate chart. */}
              {typeCounts.income + typeCounts.expense + typeCounts.transfer > 0 && (
                <div
                  className="flex h-1.5 w-full min-w-40 overflow-hidden rounded-full"
                  role="img"
                  aria-label={`Transaction type mix: ${typeCounts.income} income, ${typeCounts.expense} expense, ${typeCounts.transfer} transfer`}
                >
                  <div className="bg-app-green" style={{ width: `${(typeCounts.income / (typeCounts.income + typeCounts.expense + typeCounts.transfer)) * 100}%` }} />
                  <div className="bg-app-red" style={{ width: `${(typeCounts.expense / (typeCounts.income + typeCounts.expense + typeCounts.transfer)) * 100}%` }} />
                  <div className="bg-app-teal" style={{ width: `${(typeCounts.transfer / (typeCounts.income + typeCounts.expense + typeCounts.transfer)) * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <TransactionFilters
            key={filtersVersion}
            onFilterChange={handleFilterChange}
            categories={categories}
            accounts={accounts}
            initialValues={filters}
            tagOptions={facets?.tags ?? []}
            savedViewsSlot={<SavedViewsMenu currentFilters={filters} onApply={handleApplyView} />}
          />
        </motion.div>

        {/* Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <TransactionTable
            transactions={filteredTransactions}
            isLoading={isLoading}
            sorting={sorting}
            onSortingChange={setSorting}
            availableTags={facets?.tags?.map((t) => t.name) ?? []}
          />
        </motion.div>

        {/* Pagination */}
        {total > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Pagination
              currentPage={currentPage}
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </motion.div>
        )}
    </PageContainer>
  )
}
