import { useMemo, useState } from 'react'

import { motion } from 'framer-motion'
import { Store } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { CHART_COLORS } from '@/constants/chartColors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'

interface MerchantData {
  name: string
  totalSpent: number
  transactionCount: number
  avgTransaction: number
  categories: string[]
  lastTransaction: string
  firstTransaction: string
}

interface TopMerchantsProps {
  readonly dateRange?: { start_date?: string; end_date?: string }
  /** When set, only merchants whose transactions are in this category are shown. */
  readonly categoryFilter?: string | null
}

const COLORS = CHART_COLORS
const COLOR_STYLES = COLORS.map(c => ({ backgroundColor: c }))

export default function TopMerchants({ dateRange, categoryFilter }: TopMerchantsProps) {
  const { data: transactions = [], isLoading } = useTransactions()
  const [viewMode, setViewMode] = useState<'amount' | 'frequency'>('amount')

  const merchantData = useMemo(() => {
    const merchants: Record<string, MerchantData> = {}

    transactions
      .filter((tx) => {
        if (tx.type !== 'Expense' || !tx.note) return false
        if (categoryFilter && tx.category !== categoryFilter) return false
        if (dateRange?.start_date) {
          const txDate = tx.date.substring(0, 10)
          if (txDate < dateRange.start_date) return false
          if (dateRange.end_date && txDate > dateRange.end_date) return false
        }
        return true
      })
      .forEach((tx) => {
        // Extract merchant name from note (usually first part before any details)
        const note = tx.note ?? ''
        // Clean up common patterns
        let merchantName = note
          .split(/[-–—|,/]/)[0] // Split by common separators
          .replaceAll(/\d{4,}/g, '') // Remove long numbers (card numbers, refs)
          .replaceAll(/\s+/g, ' ')
          .trim()

        // Skip if too short or too generic
        if (merchantName.length < 3 || merchantName.length > 50) return

        // Normalize case
        merchantName = merchantName
          .toLowerCase()
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')

        if (!merchants[merchantName]) {
          merchants[merchantName] = {
            name: merchantName,
            totalSpent: 0,
            transactionCount: 0,
            avgTransaction: 0,
            categories: [],
            lastTransaction: tx.date,
            firstTransaction: tx.date,
          }
        }

        const m = merchants[merchantName]
        m.totalSpent += Math.abs(tx.amount)
        m.transactionCount++
        if (!m.categories.includes(tx.category)) {
          m.categories.push(tx.category)
        }
        if (tx.date > m.lastTransaction) m.lastTransaction = tx.date
        if (tx.date < m.firstTransaction) m.firstTransaction = tx.date
      })

    // Calculate averages
    Object.values(merchants).forEach((m) => {
      m.avgTransaction = m.totalSpent / m.transactionCount
    })

    // Sort and get top merchants
    const sorted = Object.values(merchants)
      .filter((m) => m.transactionCount >= 2) // At least 2 transactions
      .sort((a, b) => {
        if (viewMode === 'amount') return b.totalSpent - a.totalSpent
        return b.transactionCount - a.transactionCount
      })

    return sorted.slice(0, 10)
  }, [transactions, viewMode, dateRange, categoryFilter])

  const totalSpentAtTopMerchants = merchantData.reduce((sum, m) => sum + m.totalSpent, 0)

  // Largest value (by active mode) for the per-row proportional bar width.
  const maxMetric = merchantData.reduce(
    (max, m) => Math.max(max, viewMode === 'amount' ? m.totalSpent : m.transactionCount),
    0,
  )

  if (isLoading) {
    return <ChartSkeleton height="h-80" />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-orange/20 rounded-xl">
            <Store className="w-6 h-6 text-app-orange" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Top Merchants</h3>
            <p className="text-sm text-muted-foreground">Where your money goes</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('amount')}
            aria-pressed={viewMode === 'amount'}
            className={`px-3 py-2.5 min-h-11 rounded-lg text-sm transition-colors ${
              viewMode === 'amount'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background/50 hover:bg-background/70'
            }`}
          >
            By Amount
          </button>
          <button
            onClick={() => setViewMode('frequency')}
            aria-pressed={viewMode === 'frequency'}
            className={`px-3 py-2.5 min-h-11 rounded-lg text-sm transition-colors ${
              viewMode === 'frequency'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background/50 hover:bg-background/70'
            }`}
          >
            By Frequency
          </button>
        </div>
      </div>

      {merchantData.length === 0 ? (
        <ChartEmptyState message="No merchant data available. Transaction notes help identify merchants." />
      ) : (
        // A ranked list with an inline proportional bar per row reads merchant
        // magnitudes more accurately than a >7-slice donut did -- and it keeps
        // the rich per-merchant detail (visits, avg) the donut couldn't show.
        // No separate chart, so nothing is duplicated.
        <div className="space-y-2">
          {merchantData.map((merchant, index) => {
            const metric = viewMode === 'amount' ? merchant.totalSpent : merchant.transactionCount
            const barWidth = maxMetric > 0 ? (metric / maxMetric) * 100 : 0
            return (
              <div
                key={merchant.name}
                className="relative flex items-center gap-3 p-3 rounded-xl bg-background/30 hover:bg-background/50 transition-colors overflow-hidden"
              >
                {/* Proportional bar behind the row content */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-xl opacity-15"
                  style={{ width: `${barWidth}%`, backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div
                  className="relative w-8 h-8 rounded-lg flex items-center justify-center text-foreground font-bold text-sm shrink-0"
                  style={COLOR_STYLES[index % COLOR_STYLES.length]}
                >
                  {index + 1}
                </div>
                <div className="relative flex-1 min-w-0">
                  <p className="font-medium truncate">{merchant.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {merchant.transactionCount} visits • Avg {formatCurrency(merchant.avgTransaction)}
                  </p>
                </div>
                <div className="relative text-right shrink-0">
                  <p className="font-semibold tabular-nums">{formatCurrency(merchant.totalSpent)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary */}
      {merchantData.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-app-orange">{merchantData.length}</p>
            <p className="text-xs text-muted-foreground">Top Merchants</p>
          </div>
          <div>
            <p className="text-2xl font-bold break-all tabular-nums">{formatCurrency(totalSpentAtTopMerchants)}</p>
            <p className="text-xs text-muted-foreground">Total at Top 10</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {merchantData.reduce((sum, m) => sum + m.transactionCount, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Total Visits</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
