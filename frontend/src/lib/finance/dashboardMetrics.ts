import { percentChange } from '@/lib/formatters'
import { completeMonthKeys, savingsRatePercentFromNet } from '@/lib/savingsRate'
import type { MonthlyAggregation } from '@/services/api/calculations'

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
  const previousKey = periods.at(-2)
  if (!currentKey || !previousKey) return empty

  const current = monthly[currentKey]
  const previous = monthly[previousKey]
  const currentRate = savingsRatePercentFromNet(current.net_savings, current.income)
  const previousRate = savingsRatePercentFromNet(previous.net_savings, previous.income)
  return {
    income: roundedChange(current.income, previous.income),
    expense: roundedChange(Math.abs(current.expense), Math.abs(previous.expense)),
    savings: roundedChange(current.net_savings, previous.net_savings),
    savingsRate: currentRate === null || previousRate === null
      ? undefined
      : Number((currentRate - previousRate).toFixed(1)),
    label: `${monthLabel(currentKey)} vs ${monthLabel(previousKey)}`,
  }
}
