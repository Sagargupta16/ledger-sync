import { formatMonthKey, parseLocalDate, toLocalDateKey } from './dateUtils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Recognize chart dates without the browser's ambiguous Date(string) parsing.
 * Some existing chart adapters supply "Jan 26" instead of the raw month key.
 * Non-date categories and day numbers must pass through unchanged.
 */
export function chartDateKey(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T.*)?)?$/.exec(value)
  if (iso) {
    const key = `${iso[1]}-${iso[2]}-${iso[3] ?? '01'}`
    const date = parseLocalDate(key)
    return toLocalDateKey(date) === key ? key : null
  }
  const named = /^([A-Za-z]{3,4}) ['’]?(\d{2}|\d{4})$/.exec(value)
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3))
    const year = named[2].length === 4 ? named[2] : `20${named[2]}`
    return month < 0 ? null : `${year}-${String(month + 1).padStart(2, '0')}-01`
  }
  const week = /^(\d{4})-W(\d{2})$/.exec(value)
  if (week && Number(week[2]) >= 1 && Number(week[2]) <= 53) {
    const jan4 = new Date(Number(week[1]), 0, 4)
    jan4.setDate(jan4.getDate() - (jan4.getDay() + 6) % 7 + (Number(week[2]) - 1) * 7)
    return toLocalDateKey(jan4)
  }
  return null
}

/** Compact axis label with an explicit year, such as Jan ’26 or Jan 15 ’26. */
export function formatChartPeriod(value: string, monthOnly = false): string {
  const week = /^(\d{4})-W(\d{2})$/.exec(value)
  if (week) return `Wk ${week[2]} ’${week[1].slice(2)}`
  const key = chartDateKey(value)
  if (!key) return value
  const month = formatMonthKey(key, { month: 'short' })
  const day = !monthOnly && /^\d{4}-\d{2}-\d{2}/.test(value) ? ` ${Number(key.slice(8, 10))}` : ''
  return `${month}${day} ’${key.slice(2, 4)}`
}

/** Full date for tooltips, selected spans and accessible chart tables. */
export function formatChartDate(value: string): string {
  const week = /^(\d{4})-W(\d{2})$/.exec(value)
  if (week) return `Week ${Number(week[2])}, ${week[1]}`
  const key = chartDateKey(value)
  if (!key) return value
  return parseLocalDate(key).toLocaleDateString('en-US', {
    month: 'long',
    ...(/^\d{4}-\d{2}-\d{2}/.test(value) ? { day: 'numeric' as const } : {}),
    year: 'numeric',
  })
}
