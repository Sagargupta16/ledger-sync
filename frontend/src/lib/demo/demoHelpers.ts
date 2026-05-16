import type { Transaction } from '@/types'

export function monthKey(d: string): string {
  return d.slice(0, 7)
}

export function filterByDateRange(
  txs: Transaction[],
  startDate?: string,
  endDate?: string,
): Transaction[] {
  let filtered = txs
  if (startDate) filtered = filtered.filter((t) => t.date >= startDate)
  if (endDate) filtered = filtered.filter((t) => t.date <= endDate)
  return filtered
}

export function isExpense(t: Transaction): boolean {
  return t.type === 'Expense'
}

export function isIncome(t: Transaction): boolean {
  return t.type === 'Income'
}

export function isTransfer(t: Transaction): boolean {
  return t.type === 'Transfer'
}

export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

export const ESSENTIAL_CATEGORIES = [
  'Housing',
  'Food & Dining',
  'Healthcare',
  'Transportation',
  'Education',
  'Family',
]
