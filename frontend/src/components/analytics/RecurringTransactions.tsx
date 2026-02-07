import { motion } from 'framer-motion'
import { RefreshCw, AlertCircle, CheckCircle, Calendar, DollarSign } from 'lucide-react'
import { useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'

interface RecurringTransaction {
  pattern: string
  category: string
  subcategory?: string
  avgAmount: number
  frequency: 'monthly' | 'quarterly' | 'yearly'
  lastDate: string
  occurrences: number
  totalSpent: number
  isActive: boolean
  expectedNextDate: string
}

type Frequency = 'monthly' | 'quarterly' | 'yearly'

function computeIntervals(sortedDates: string[]): number[] {
  const intervals: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1])
    const curr = new Date(sortedDates[i])
    const daysDiff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
    intervals.push(daysDiff)
  }
  return intervals
}

function classifyFrequency(avgInterval: number): Frequency | null {
  if (avgInterval >= 25 && avgInterval <= 38) return 'monthly'
  if (avgInterval >= 80 && avgInterval <= 105) return 'quarterly'
  if (avgInterval >= 345 && avgInterval <= 385) return 'yearly'
  return null
}

function isConsistentTiming(intervals: number[], avgInterval: number, occurrenceCount: number): boolean {
  if (intervals.length <= 1) return true
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = avgInterval > 0 ? stdDev / avgInterval : 0
  const maxCV = occurrenceCount <= 3 ? 0.6 : 0.4
  return coefficientOfVariation <= maxCV
}

function isConsistentAmount(amounts: number[]): boolean {
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const consistentAmounts = amounts.filter((a) => avgAmount > 0 && Math.abs(a - avgAmount) / avgAmount < 0.3)
  return consistentAmounts.length >= amounts.length * 0.5
}

function computeExpectedNextDate(lastDate: Date, frequency: Frequency): Date {
  const expectedNext = new Date(lastDate)
  if (frequency === 'monthly') {
    expectedNext.setMonth(expectedNext.getMonth() + 1)
  } else if (frequency === 'quarterly') {
    expectedNext.setMonth(expectedNext.getMonth() + 3)
  } else {
    expectedNext.setFullYear(expectedNext.getFullYear() + 1)
  }
  return expectedNext
}

function checkIsActive(lastDate: Date, frequency: Frequency): boolean {
  const today = new Date()
  const daysSinceLast = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
  const maxDaysMap: Record<Frequency, number> = { monthly: 45, quarterly: 120, yearly: 400 }
  return daysSinceLast < maxDaysMap[frequency]
}

export default function RecurringTransactions() {
  const { data: transactions = [], isLoading } = useTransactions()

  const recurringTransactions = useMemo(() => {
    if (!transactions.length) return []

    // Group transactions by note (merchant/description) for better matching
    const byNote: Record<
      string,
      {
        amounts: number[]
        dates: string[]
        category: string
        subcategory?: string
        note: string
      }
    > = {}

    // Also track by category+subcategory with similar amounts
    const byCategory: Record<
      string,
      {
        amounts: number[]
        dates: string[]
        category: string
        subcategory?: string
      }
    > = {}

    transactions
      .filter((tx) => tx.type === 'Expense')
      .forEach((tx) => {
        const amount = Math.abs(tx.amount)

        // Group by note if present and meaningful (more than 3 chars)
        if (tx.note && tx.note.trim().length > 3) {
          const noteKey = tx.note.toLowerCase().trim()
          if (!byNote[noteKey]) {
            byNote[noteKey] = {
              amounts: [],
              dates: [],
              category: tx.category,
              subcategory: tx.subcategory,
              note: tx.note,
            }
          }
          byNote[noteKey].amounts.push(amount)
          byNote[noteKey].dates.push(tx.date)
        }

        // Group by category+subcategory for amount-based matching
        const catKey = `${tx.category}_${tx.subcategory || ''}`
        if (!byCategory[catKey]) {
          byCategory[catKey] = {
            amounts: [],
            dates: [],
            category: tx.category,
            subcategory: tx.subcategory,
          }
        }
        byCategory[catKey].amounts.push(amount)
        byCategory[catKey].dates.push(tx.date)
      })

    const recurring: RecurringTransaction[] = []
    const processedKeys = new Set<string>()

    // Helper function to detect recurring patterns
    const detectPattern = (
      data: {
        amounts: number[]
        dates: string[]
        category: string
        subcategory?: string
        note?: string
      },
    ): RecurringTransaction | null => {
      if (data.amounts.length < 2) return null // Need at least 2 occurrences for recurring

      // Sort dates
      const sortedDates = [...data.dates].sort((a, b) => a.localeCompare(b))

      // Calculate intervals between transactions
      const intervals = computeIntervals(sortedDates)
      if (intervals.length < 1) return null

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const frequency = classifyFrequency(avgInterval)
      if (!frequency) return null

      if (!isConsistentTiming(intervals, avgInterval, data.amounts.length)) return null
      if (!isConsistentAmount(data.amounts)) return null

      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length
      const lastDateStr = sortedDates.at(-1)!
      const lastDate = new Date(lastDateStr)
      const expectedNext = computeExpectedNextDate(lastDate, frequency)
      const isActive = checkIsActive(lastDate, frequency)
      const subcategorySuffix = data.subcategory ? ` - ${data.subcategory}` : ''
      const patternName = data.note || `${data.category}${subcategorySuffix}`

      return {
        pattern: patternName,
        category: data.category,
        subcategory: data.subcategory,
        avgAmount,
        frequency,
        lastDate: lastDateStr,
        occurrences: data.amounts.length,
        totalSpent: data.amounts.reduce((a, b) => a + b, 0),
        isActive,
        expectedNextDate: expectedNext.toISOString().split('T')[0],
      }
    }

    // First process by note (more specific)
    Object.entries(byNote).forEach(([key, data]) => {
      if (processedKeys.has(key)) return
      const result = detectPattern({ ...data, note: data.note })
      if (result) {
        recurring.push(result)
        processedKeys.add(key)
      }
    })

    // Then process by category (for expenses without specific notes)
    Object.entries(byCategory).forEach(([key, data]) => {
      if (processedKeys.has(key)) return

      // Group amounts into buckets for similar values
      const amountBuckets: Record<string, { amounts: number[]; dates: string[] }> = {}

      data.amounts.forEach((amount, idx) => {
        // Round to nearest 100 for bucketing
        const bucket = Math.round(amount / 100) * 100
        const bucketKey = `${key}_${bucket}`
        if (!amountBuckets[bucketKey]) {
          amountBuckets[bucketKey] = { amounts: [], dates: [] }
        }
        amountBuckets[bucketKey].amounts.push(amount)
        amountBuckets[bucketKey].dates.push(data.dates[idx])
      })

      // Process each amount bucket
      Object.entries(amountBuckets).forEach(([bucketKey, bucketData]) => {
        if (processedKeys.has(bucketKey)) return
        if (bucketData.amounts.length < 2) return

        const result = detectPattern({
          ...bucketData,
          category: data.category,
          subcategory: data.subcategory,
        })
        if (result) {
          recurring.push(result)
          processedKeys.add(bucketKey)
        }
      })
    })

    // Sort by average amount (highest first)
    return recurring.sort((a, b) => b.avgAmount - a.avgAmount)
  }, [transactions])

  // Calculate totals
  const monthlyCommitment = useMemo(() => {
    return recurringTransactions
      .filter((r) => r.isActive)
      .reduce((sum, r) => {
        if (r.frequency === 'monthly') return sum + r.avgAmount
        if (r.frequency === 'quarterly') return sum + r.avgAmount / 3
        return sum + r.avgAmount / 12
      }, 0)
  }, [recurringTransactions])

  const activeCount = recurringTransactions.filter((r) => r.isActive).length

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-500/20 rounded-xl">
            <RefreshCw className="w-6 h-6 text-cyan-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Recurring Transactions</h3>
            <p className="text-sm text-muted-foreground">
              {activeCount} active • {formatCurrency(monthlyCommitment)}/month commitment
            </p>
          </div>
        </div>
      </div>

      {recurringTransactions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-2">No recurring patterns detected yet.</p>
          <p className="text-xs text-muted-foreground">
            Recurring transactions are detected when similar amounts appear at regular intervals (monthly, quarterly, yearly).
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {recurringTransactions.map((item, index) => (
            <div
              key={`${item.pattern}-${index}`}
              className={`p-4 rounded-xl border transition-all ${
                item.isActive
                  ? 'bg-background/30 border-white/10 hover:border-white/20'
                  : 'bg-background/10 border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{item.pattern}</span>
                    {item.isActive ? (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {item.frequency}
                    </span>
                    <span>{item.occurrences} occurrences</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-red-500">{formatCurrency(item.avgAmount)}</p>
                  <p className="text-xs text-muted-foreground">Total: {formatCurrency(item.totalSpent)}</p>
                </div>
              </div>
              {item.isActive && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Last: {new Date(item.lastDate).toLocaleDateString()}
                  </span>
                  <span className="text-cyan-500">
                    Next expected: {new Date(item.expectedNextDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Monthly Summary */}
      {recurringTransactions.length > 0 && (
        <div className="mt-4 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-cyan-500" />
              <span className="font-medium">Monthly Fixed Costs</span>
            </div>
            <span className="text-xl font-bold text-cyan-500">{formatCurrency(monthlyCommitment)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Based on {activeCount} active recurring expenses
          </p>
        </div>
      )}
    </motion.div>
  )
}
