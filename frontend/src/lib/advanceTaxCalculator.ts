/**
 * Advance Tax Quarterly Schedule Calculator
 *
 * Indian advance tax is paid in 4 installments during the financial year:
 * - Q1: 15% by June 15
 * - Q2: 45% by September 15 (cumulative, so 30% in this quarter)
 * - Q3: 75% by December 15 (cumulative, so 30% in this quarter)
 * - Q4: 100% by March 15 (remaining 25%)
 *
 * Section 234B/234C interest applies for shortfall or late payment.
 */

export interface AdvanceTaxQuarter {
  quarter: string
  dueDate: string
  cumulativePercent: number
  quarterPercent: number
  cumulativeAmount: number
  quarterAmount: number
  status: 'paid' | 'upcoming' | 'overdue'
}

export interface AdvanceTaxSchedule {
  quarters: AdvanceTaxQuarter[]
  totalTax: number
  tdsPaid: number
  advanceTaxDue: number
  nextDueQuarter: AdvanceTaxQuarter | null
}

const QUARTER_CONFIG = [
  { quarter: 'Q1', month: 6, day: 15, cumulativePercent: 15 },
  { quarter: 'Q2', month: 9, day: 15, cumulativePercent: 45 },
  { quarter: 'Q3', month: 12, day: 15, cumulativePercent: 75 },
  { quarter: 'Q4', month: 3, day: 15, cumulativePercent: 100 },
] as const

/**
 * Get the FY start year for the current date.
 * If current month >= April, FY start = current year.
 * Otherwise FY start = previous year.
 */
function getCurrentFYStartYear(): number {
  const now = new Date()
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
}

/**
 * Compute the advance tax quarterly schedule.
 *
 * @param totalTax - Estimated total tax liability for the FY
 * @param tdsPaid - TDS already deducted/paid
 */
export function computeAdvanceTaxSchedule(
  totalTax: number,
  tdsPaid: number = 0,
): AdvanceTaxSchedule {
  const advanceTaxDue = Math.max(0, totalTax - tdsPaid)
  const fyStart = getCurrentFYStartYear()
  const today = new Date()

  let prevCumulativePercent = 0
  const quarters: AdvanceTaxQuarter[] = QUARTER_CONFIG.map((q) => {
    const quarterPercent = q.cumulativePercent - prevCumulativePercent
    prevCumulativePercent = q.cumulativePercent

    // Q4 due date is in the next calendar year if FY starts in April
    const year = q.month <= 3 ? fyStart + 1 : fyStart
    const dueDate = `${year}-${String(q.month).padStart(2, '0')}-${String(q.day).padStart(2, '0')}`

    const dueDateObj = new Date(year, q.month - 1, q.day)
    const status: AdvanceTaxQuarter['status'] = today > dueDateObj ? 'overdue' : 'upcoming'

    return {
      quarter: q.quarter,
      dueDate,
      cumulativePercent: q.cumulativePercent,
      quarterPercent,
      cumulativeAmount: Math.round((advanceTaxDue * q.cumulativePercent) / 100),
      quarterAmount: Math.round((advanceTaxDue * quarterPercent) / 100),
      status,
    }
  })

  // Mark past quarters as "paid" (assumption: if due date passed, it's been paid)
  // The first upcoming quarter is the "next due"
  let nextDueQuarter: AdvanceTaxQuarter | null = null
  for (const q of quarters) {
    if (q.status === 'upcoming' && !nextDueQuarter) {
      nextDueQuarter = q
    }
  }

  return { quarters, totalTax, tdsPaid, advanceTaxDue, nextDueQuarter }
}

/**
 * Format a date string as "Jun 15, 2025"
 */
export function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
}
