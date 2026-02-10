import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Download, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import type { SortingState } from '@tanstack/react-table'
import TransactionTable from '@/components/transactions/TransactionTable'
import TransactionFilters, { type FilterValues } from '@/components/transactions/TransactionFilters'
import Pagination from '@/components/transactions/Pagination'
import { useTransactions } from '@/hooks/api/useTransactions'
import { transactionsService } from '@/services/api/transactions'
import { toast } from 'sonner'

export default function TransactionsPage() {
  const [filters, setFilters] = useState<FilterValues>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [isExporting, setIsExporting] = useState(false)

  // Fetch all transactions
  const { data: allTransactions = [], isLoading } = useTransactions()

  // Filter and sort transactions client-side
  const filteredAndSortedTransactions = useMemo(() => {
    let result = [...allTransactions]

    // Apply text search filter
    if (filters.query) {
      const queryLower = filters.query.toLowerCase()
      result = result.filter(
        (tx) =>
          tx.note?.toLowerCase().includes(queryLower) ||
          tx.category?.toLowerCase().includes(queryLower) ||
          tx.account?.toLowerCase().includes(queryLower)
      )
    }

    // Apply category filter
    if (filters.category) {
      result = result.filter((tx) => tx.category === filters.category)
    }

    // Apply account filter
    if (filters.account) {
      result = result.filter((tx) => 
        tx.account === filters.account || 
        tx.from_account === filters.account || 
        tx.to_account === filters.account
      )
    }

    // Apply type filter
    if (filters.type) {
      result = result.filter((tx) => tx.type === filters.type)
    }

    // Apply amount filters
    if (filters.min_amount !== undefined) {
      result = result.filter((tx) => Math.abs(tx.amount) >= filters.min_amount!)
    }
    if (filters.max_amount !== undefined) {
      result = result.filter((tx) => Math.abs(tx.amount) <= filters.max_amount!)
    }

    // Apply date filters
    if (filters.start_date) {
      const startDate = new Date(filters.start_date)
      result = result.filter((tx) => new Date(tx.date) >= startDate)
    }
    if (filters.end_date) {
      const endDate = new Date(filters.end_date)
      result = result.filter((tx) => new Date(tx.date) <= endDate)
    }

    // Apply sorting
    const sortField = sorting[0]?.id || 'date'
    const sortDesc = sorting[0]?.desc ?? true
    result.sort((a, b) => {
      const aVal = a[sortField as keyof typeof a] as string | number
      const bVal = b[sortField as keyof typeof b] as string | number

      if (aVal < bVal) return sortDesc ? 1 : -1
      if (aVal > bVal) return sortDesc ? -1 : 1
      return 0
    })

    return result
  }, [allTransactions, filters, sorting])

  // Calculate offset for pagination
  const offset = (currentPage - 1) * itemsPerPage
  const paginatedTransactions = filteredAndSortedTransactions.slice(offset, offset + itemsPerPage)
  const total = filteredAndSortedTransactions.length

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
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
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

  // Extract unique categories and accounts for filter dropdowns
  const categories = useMemo(() => {
    return Array.from(new Set(allTransactions.map((t) => t.category))).sort((a, b) => a.localeCompare(b))
  }, [allTransactions])

  const accounts = useMemo(() => {
    return Array.from(new Set(allTransactions.map((t) => t.account))).sort((a, b) => a.localeCompare(b))
  }, [allTransactions])

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <PageHeader
          title="Transactions"
          subtitle="Browse and search your transaction history"
          action={
            <motion.button
              onClick={handleExportCSV}
              whileTap={{ scale: 0.97 }}
              disabled={isExporting || paginatedTransactions.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg hover:shadow-primary/50 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
              <Receipt className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Transactions</p>
              <p className="text-2xl font-bold">{allTransactions.length.toLocaleString()}</p>
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
            transactions={paginatedTransactions}
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
