import { FY_START_MONTH } from '@/lib/taxCalculator'

export function parseBareStartYear(fy: string): number {
  return Number.parseInt(fy.split('-')[0] || '0', 10)
}

export function currentFYLabel(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const startYear = month >= FY_START_MONTH ? year : year - 1
  const endYear = (startYear + 1) % 100
  return `${startYear}-${String(endYear).padStart(2, '0')}`
}

export function nextFY(fy: string): string {
  const start = parseBareStartYear(fy) + 1
  const end = (start + 1) % 100
  return `${start}-${String(end).padStart(2, '0')}`
}

export function dateToFY(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  const fyStartYear = month >= FY_START_MONTH ? year : year - 1
  const endYear = (fyStartYear + 1) % 100
  return `${fyStartYear}-${String(endYear).padStart(2, '0')}`
}
