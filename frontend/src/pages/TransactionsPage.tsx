import { useState, useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download, Receipt } from 'lucide-react'
import type { SortingState } from '@tanstack/react-table'
import { toast } from 'sonner'

import { PageHeader } from '@/components/ui'
import TransactionTable from '@/components/transactions/TransactionTable'
import TransactionFilters, { type FilterValues } from '@/components/transactions/TransactionFilters'
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

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters)
    setCurrentPage(1) // Reset to first page when filters change
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
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <PageHeader
          title="Transactions"
          subtitle="Browse and search your transaction history"
          action={
            <motion.button
              onClick={handleExportCSV}
              whileTap={{ scale: 0.97 }}
              disabled={isExporting || filteredTransactions.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg hover:shadow-primary/50 transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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
          className="glass rounded-2xl border border-border p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl">
                <Receipt className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Transactions</p>
                <p className="text-2xl font-bold tabular-nums">{(facets?.total_count ?? 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="flex items-center gap-8 sm:gap-10">
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
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <TransactionFilters onFilterChange={handleFilterChange} categories={categories} accounts={accounts} />
        </motion.div>

        {/* Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <TransactionTable
            transactions={filteredTransactions}
            isLoading={isLoading}
            sorting={sorting}
            onSortingChange={setSorting}
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
      </div>
    </div>
  )
}
