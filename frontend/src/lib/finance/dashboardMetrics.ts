import { percentChange } from '@/lib/formatters'
import { completeMonthKeys, savingsRatePercentFromNet } from '@/lib/savingsRate'
import type { MonthlyAggregation } from '@/services/api/calculations'
import { addMonthsToMonthKey } from '@/lib/dateUtils'

export interface MonthlyChanges {
  income: number | undefined
  expense: number | undefined
  savings: number | undefined
  savingsRate: number | undefined
  label: string
}

function roundedChange(current: number, previous: number): number | undefined {
  const change = percentChange(current, previous)
  return change === null ? undefined : Number(change.toFixed(1))
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1).toLocaleString('default', { month: 'short', year: '2-digit' })
}

/** Compare complete periods using the API's net cash flow, including capital losses. */
export function computeMonthlyChanges(
  monthly: MonthlyAggregation | undefined,
  now: Date = new Date(),
  earningStartDate?: string | null,
): MonthlyChanges {
  const empty: MonthlyChanges = {
    income: undefined,
    expense: undefined,
    savings: undefined,
    savingsRate: undefined,
    label: 'vs prev month',
  }
  if (!monthly) return empty
  const periods = completeMonthKeys(Object.keys(monthly), now).sort((a, b) => a.localeCompare(b))
  const currentKey = periods.at(-1)
  if (!currentKey) return empty
  const previousKey = addMonthsToMonthKey(currentKey, -1)
  if (previousKey < periods[0]) return empty

  const current = monthly[currentKey]
  const previous = monthly[previousKey] ?? { income: 0, expense: 0, net_savings: 0 }
  const currentRate = savingsRatePercentFromNet(current.net_savings, current.income)
  const previousRate = savingsRatePercentFromNet(previous.net_savings, previous.income)
  return {
    income: earningStartDate && previousKey < earningStartDate.slice(0, 7)
      ? undefined : roundedChange(current.income, previous.income),
    expense: roundedChange(Math.abs(current.expense), Math.abs(previous.expense)),
    savings: roundedChange(current.net_savings, previous.net_savings),
    savingsRate: currentRate === null || previousRate === null
      ? undefined
      : Number((currentRate - previousRate).toFixed(1)),
    label: `${monthLabel(currentKey)} vs ${monthLabel(previousKey)}`,
  }
}
