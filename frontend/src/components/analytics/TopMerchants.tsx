import { motion } from 'framer-motion'
import { Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { chartTooltipProps } from '@/components/ui'
import { CHART_COLORS } from '@/constants/chartColors'

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
}

const COLORS = CHART_COLORS
const COLOR_STYLES = COLORS.map(c => ({ backgroundColor: c }))

export default function TopMerchants({ dateRange }: TopMerchantsProps) {
  const { data: transactions = [], isLoading } = useTransactions()
  const [viewMode, setViewMode] = useState<'amount' | 'frequency'>('amount')

  const merchantData = useMemo(() => {
    const merchants: Record<string, MerchantData> = {}

    transactions
      .filter((tx) => {
        if (tx.type !== 'Expense' || !tx.note) return false
        if (dateRange?.start_date) {
          const txDate = tx.date.substring(0, 10)
          if (txDate < dateRange.start_date) return false
          if (dateRange.end_date && txDate > dateRange.end_date) return false
        }
        return true
      })
      .forEach((tx) => {
        // Extract merchant name from note (usually first part before any details)
        const note = tx.note!
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
  }, [transactions, viewMode, dateRange])

  const totalSpentAtTopMerchants = merchantData.reduce((sum, m) => sum + m.totalSpent, 0)

  // Pie chart data
  const pieData = merchantData.slice(0, 8).map((m) => ({
    name: m.name,
    value: viewMode === 'amount' ? m.totalSpent : m.transactionCount,
  }))

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-border p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-ios-orange/20 rounded-xl">
            <Store className="w-6 h-6 text-ios-orange" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Top Merchants</h3>
            <p className="text-sm text-muted-foreground">Where your money goes</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('amount')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              viewMode === 'amount'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background/50 hover:bg-background/70'
            }`}
          >
            By Amount
          </button>
          <button
            onClick={() => setViewMode('frequency')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
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
        <p className="text-muted-foreground text-center py-8">
          No merchant data available. Transaction notes help identify merchants.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(value: number | undefined) => {
                    if (value === undefined) return ''
                    return viewMode === 'amount' ? formatCurrency(value) : `${value} visits`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Merchant List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {merchantData.map((merchant, index) => (
              <div
                key={merchant.name}
                className="flex items-center gap-3 p-3 rounded-xl bg-background/30 hover:bg-background/50 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={COLOR_STYLES[index % COLOR_STYLES.length]}
                >
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{merchant.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {merchant.transactionCount} visits • Avg {formatCurrency(merchant.avgTransaction)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(merchant.totalSpent)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {merchantData.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-ios-orange">{merchantData.length}</p>
            <p className="text-xs text-muted-foreground">Top Merchants</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{formatCurrency(totalSpentAtTopMerchants)}</p>
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
