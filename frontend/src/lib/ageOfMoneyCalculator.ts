/**
 * Age of Money & Days of Buffering Calculators
 *
 * Age of Money (YNAB concept): Uses FIFO matching to determine how old
 * the money you're spending today is. Higher = more financial runway.
 *
 * Days of Buffering: How many days your current liquid balance can cover
 * at your average daily spending rate.
 */

interface IncomeBucket {
  date: string
  remaining: number
}

/**
 * Compute the "Age of Money" using FIFO matching.
 *
 * For each expense, dequeue from the oldest income bucket first.
 * Track the weighted average age (expense_date - income_date).
 *
 * @returns Average age in days, or null if insufficient data
 */
export function computeAgeOfMoney(
  transactions: Array<{ type: string; amount: number; date: string }>,
): number | null {
  // Sort all transactions by date
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

  const queue: IncomeBucket[] = []
  let ageSum = 0
  let totalMatched = 0

  for (const tx of sorted) {
    if (tx.type === 'Income') {
      queue.push({ date: tx.date, remaining: Math.abs(tx.amount) })
      continue
    }

    if (tx.type !== 'Expense') continue

    let remaining = Math.abs(tx.amount)
    const expenseDate = new Date(tx.date)

    while (remaining > 0 && queue.length > 0) {
      const bucket = queue[0]
      const matched = Math.min(remaining, bucket.remaining)
      const incomeDate = new Date(bucket.date)
      const ageDays = Math.max(0, (expenseDate.getTime() - incomeDate.getTime()) / (1000 * 60 * 60 * 24))

      ageSum += matched * ageDays
      totalMatched += matched
      bucket.remaining -= matched
      remaining -= matched

      if (bucket.remaining <= 0) {
        queue.shift()
      }
    }
  }

  if (totalMatched === 0) return null
  return Math.round(ageSum / totalMatched)
}

/**
 * Compute "Days of Buffering" based on liquid balance and average daily spending.
 *
 * Uses a 90-day lookback for the spending average.
 *
 * @returns Number of days the balance can cover, or null if insufficient data
 */
export function computeDaysOfBuffering(
  liquidBalance: number,
  transactions: Array<{ type: string; amount: number; date: string }>,
  lookbackDays = 90,
): number | null {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - lookbackDays)
  const cutoffStr = cutoff.toISOString().substring(0, 10)

  let totalSpending = 0
  const expenseDays = new Set<string>()

  for (const tx of transactions) {
    if (tx.type !== 'Expense') continue
    if (tx.date < cutoffStr) continue
    totalSpending += Math.abs(tx.amount)
    expenseDays.add(tx.date)
  }

  const daysWithExpenses = expenseDays.size
  if (daysWithExpenses === 0 || totalSpending === 0) return null

  // Average daily spending across the lookback period
  const avgDailySpending = totalSpending / lookbackDays
  if (avgDailySpending <= 0) return null

  return Math.round(liquidBalance / avgDailySpending)
}
