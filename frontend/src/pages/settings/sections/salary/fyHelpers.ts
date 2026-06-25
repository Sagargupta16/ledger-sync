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
  // Parse YYYY-MM directly so a 1st-of-month date isn't shifted into the prior
  // month/FY off-UTC (new Date(iso) is UTC midnight but getMonth() is local).
  const isoMatch = /^(\d{4})-(\d{2})/.exec(dateStr)
  let month: number
  let year: number
  if (isoMatch) {
    year = Number(isoMatch[1])
    month = Number(isoMatch[2])
  } else {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return ''
    month = d.getUTCMonth() + 1
    year = d.getUTCFullYear()
  }
  const fyStartYear = month >= FY_START_MONTH ? year : year - 1
  const endYear = (fyStartYear + 1) % 100
  return `${fyStartYear}-${String(endYear).padStart(2, '0')}`
}
