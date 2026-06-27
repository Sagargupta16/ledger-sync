import { MS_PER_DAY, parseLocalDate, toLocalDateKey } from '@/lib/dateUtils'

export interface RecurringTransaction {
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

export type Frequency = 'monthly' | 'quarterly' | 'yearly'

export function computeIntervals(sortedDates: string[]): number[] {
  const intervals: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1])
    const curr = new Date(sortedDates[i])
    const daysDiff = Math.round((curr.getTime() - prev.getTime()) / MS_PER_DAY)
    intervals.push(daysDiff)
  }
  return intervals
}

export function classifyFrequency(avgInterval: number): Frequency | null {
  if (avgInterval >= 25 && avgInterval <= 38) return 'monthly'
  if (avgInterval >= 80 && avgInterval <= 105) return 'quarterly'
  if (avgInterval >= 345 && avgInterval <= 385) return 'yearly'
  return null
}

export function isConsistentTiming(intervals: number[], avgInterval: number, occurrenceCount: number): boolean {
  if (intervals.length <= 1) return true
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = avgInterval > 0 ? stdDev / avgInterval : 0
  const maxCV = occurrenceCount <= 3 ? 0.6 : 0.4
  return coefficientOfVariation <= maxCV
}

export function isConsistentAmount(amounts: number[]): boolean {
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const consistentAmounts = amounts.filter((a) => avgAmount > 0 && Math.abs(a - avgAmount) / avgAmount < 0.3)
  return consistentAmounts.length >= amounts.length * 0.5
}

export function computeExpectedNextDate(lastDate: Date, frequency: Frequency): Date {
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

export function checkIsActive(lastDate: Date, frequency: Frequency): boolean {
  const today = new Date()
  const daysSinceLast = Math.round((today.getTime() - lastDate.getTime()) / MS_PER_DAY)
  const maxDaysMap: Record<Frequency, number> = { monthly: 45, quarterly: 120, yearly: 400 }
  return daysSinceLast < maxDaysMap[frequency]
}

export function detectPattern(
  data: {
    amounts: number[]
    dates: string[]
    category: string
    subcategory?: string
    note?: string
  },
): RecurringTransaction | null {
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
  const lastDateStr = sortedDates.at(-1)
  if (!lastDateStr) return null
  const lastDate = parseLocalDate(lastDateStr)
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
    expectedNextDate: toLocalDateKey(expectedNext),
  }
}
