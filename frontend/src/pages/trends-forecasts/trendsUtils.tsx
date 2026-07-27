import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import type { TrendDirection } from './types'

export function getDirectionIcon(direction: TrendDirection): React.ReactElement {
  if (direction === 'up') {
    return <ArrowUpRight className="w-4 h-4" />
  }
  if (direction === 'down') {
    return <ArrowDownRight className="w-4 h-4" />
  }
  return <Minus className="w-4 h-4" />
}

/**
 * Human label for a series key in the trend tooltips.
 *
 * `windowMonths` is passed in rather than baked into the string so the tooltip
 * cannot outlive a change to `ROLLING_AVG_MONTHS` -- the "3m avg" text used to
 * be hardcoded here while the window came from a constant elsewhere.
 */
export function formatTooltipName(name: string | undefined, windowMonths: number): string {
  const avg = `${windowMonths}m avg`
  if (name === 'income') return 'Income'
  if (name === 'incomeAvg') return `Income (${avg})`
  if (name === 'expenses') return 'Spending'
  if (name === 'expensesAvg') return `Spending (${avg})`
  if (name === 'savings') return 'Savings'
  if (name === 'savingsAvg') return `Savings (${avg})`
  return name ?? ''
}

export function getTrendDirection(change: number): TrendDirection {
  if (Math.abs(change) < 2) return 'stable'
  return change > 0 ? 'up' : 'down'
}
