import { useState, useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'
import { Download, Receipt } from 'lucide-react'
import type { SortingState } from '@tanstack/react-table'
import { toast } from 'sonner'

import { Button, PageContainer, PageHeader } from '@/components/ui'
import TransactionTable from '@/components/transactions/TransactionTable'
import TransactionFilters, { type FilterValues } from '@/components/transactions/TransactionFilters'
import SavedViewsMenu from '@/components/transactions/SavedViewsMenu'
import Pagination from '@/components/transactions/Pagination'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
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
  const facetsQuery = useTransactionFacets()
  const facets = facetsQuery.data
  const categories = facets?.categories ?? []
  const accounts = facets?.accounts ?? []
  const typeCounts = {
    income: facets?.income_count ?? 0,
    expense: facets?.expense_count ?? 0,
    transfer: facets?.transfer_count ?? 0,
  }

  // Fetch filtered + sorted + paginated rows from the server. The response
  // carries the filtered total, so no separate count query is needed.
  const pageQuery = useQuery({
    queryKey: ['transactions-page', serverFilters],
    queryFn: () => transactionsService.getTransactionsPaginated(serverFilters),
    staleTime: Infinity,
  })
  const page = pageQuery.data
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

  if (facetsQuery.isLoading || pageQuery.isLoading) return <PageSkeleton />

  if (facetsQuery.isError || pageQuery.isError) {
    const retryTransactions = () => {
      void facetsQuery.refetch()
      void pageQuery.refetch()
    }
    return (
      <PageErrorState
        title="Transactions"
        subtitle="Search, filter, and export every reconciled ledger entry."
        onRetry={retryTransactions}
      />
    )
  }

  return (
    <PageContainer>
        {/* Header */}
        <PageHeader
          title="Transactions"
          subtitle="Search, filter, and export every reconciled ledger entry."
          action={
            <Button
              onClick={handleExportCSV}
              disabled={isExporting || filteredTransactions.length === 0}
              aria-disabled={isExporting || filteredTransactions.length === 0}
              title={filteredTransactions.length === 0 ? 'No transactions to export' : undefined}
              variant="outline"
              size="md"
              icon={<Download className={`size-4 ${isExporting ? 'animate-pulse' : ''}`} />}
            >
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          }
        />

        <section className="ledger-panel">
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--hairline-1)] lg:grid-cols-4 lg:divide-y-0">
            <div className="flex min-h-24 items-center gap-3 p-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--overlay-3)]">
                <Receipt className="size-4 text-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-xs leading-4 text-muted-foreground">
                  {isFiltered ? 'Matching transactions' : 'Total transactions'}
                </p>
                <p className="ledger-figure mt-1 break-words text-xl font-semibold">
                  {total.toLocaleString('en-IN')}
                  {isFiltered && (
                    <span className="mt-0.5 block text-xs font-medium text-muted-foreground sm:ml-1 sm:inline sm:text-sm">
                      of {unfilteredTotal.toLocaleString('en-IN')}
                    </span>
                  )}
                </p>
              </div>
            </div>
            {[
              { label: 'Income', value: typeCounts.income, color: 'text-app-green' },
              { label: 'Expense', value: typeCounts.expense, color: 'text-app-red' },
              { label: 'Transfer', value: typeCounts.transfer, color: 'text-app-teal' },
            ].map((item) => (
              <div key={item.label} className="min-h-24 p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`ledger-figure mt-3 text-xl font-semibold ${item.color}`}>
                  {item.value.toLocaleString('en-IN')}
                </p>
              </div>
            ))}
          </div>
          {typeCounts.income + typeCounts.expense + typeCounts.transfer > 0 && (
            <div className="border-t border-[var(--hairline-1)] px-4 py-3">
              <div
                className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--overlay-2)]"
                role="img"
                aria-label={`Transaction type mix: ${typeCounts.income} income, ${typeCounts.expense} expense, ${typeCounts.transfer} transfer`}
              >
                <div className="bg-app-green" style={{ width: `${(typeCounts.income / (typeCounts.income + typeCounts.expense + typeCounts.transfer)) * 100}%` }} />
                <div className="bg-app-red" style={{ width: `${(typeCounts.expense / (typeCounts.income + typeCounts.expense + typeCounts.transfer)) * 100}%` }} />
                <div className="bg-app-teal" style={{ width: `${(typeCounts.transfer / (typeCounts.income + typeCounts.expense + typeCounts.transfer)) * 100}%` }} />
              </div>
            </div>
          )}
        </section>

        {/* Filters */}
        <div>
          <TransactionFilters
            key={filtersVersion}
            onFilterChange={handleFilterChange}
            categories={categories}
            accounts={accounts}
            initialValues={filters}
            tagOptions={facets?.tags ?? []}
            savedViewsSlot={<SavedViewsMenu currentFilters={filters} onApply={handleApplyView} />}
          />
        </div>

        {/* Table */}
        <div>
          <TransactionTable
            transactions={filteredTransactions}
            isLoading={pageQuery.isLoading}
            sorting={sorting}
            onSortingChange={setSorting}
            availableTags={facets?.tags?.map((t) => t.name) ?? []}
          />
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div>
            <Pagination
              currentPage={currentPage}
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </div>
        )}
        <div className="ledger-ruler" aria-hidden="true" />
    </PageContainer>
  )
}
