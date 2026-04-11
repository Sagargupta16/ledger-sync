import { percentChange } from '@/lib/formatters'

/** Return Tailwind class for the change badge background + text */
export function changeBadgeClass(change: number, isGood: boolean): string {
  if (Math.abs(change) < 1) return 'text-muted-foreground bg-white/5'
  if (isGood) return 'text-app-green bg-app-green/10'
  return 'text-app-red bg-app-red/10'
}

export const pctChange = (curr: number, prev: number): number =>
  percentChange(curr, prev) ?? (curr === 0 ? 0 : 100)

export const getMonthOptions = (transactions: Array<{ date: string }>) => {
  const months = new Set<string>()
  for (const tx of transactions) months.add(tx.date.substring(0, 7))
  return Array.from(months).sort((a, b) => b.localeCompare(a))
}

export const getYearOptions = (transactions: Array<{ date: string }>) => {
  const years = new Set<number>()
  for (const tx of transactions) years.add(Number.parseInt(tx.date.substring(0, 4)))
  return Array.from(years).sort((a, b) => b - a)
}

export const formatMonthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
