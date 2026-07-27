import { rawColors } from '@/constants/colors'

// ---------------------------------------------------------------------------
// Frequency / cost helpers
// ---------------------------------------------------------------------------
//
// The annualization table lives in `@/lib/recurrenceFrequency`, not here. The
// local switch this replaced had no `daily` case, so a daily subscription hit
// the `default: 12` arm and was costed as monthly -- 365/12 = ~30x too cheap.

/** Frequency label to annual multiplier */
export { periodsPerYear as getAnnualFactor } from '@/lib/recurrenceFrequency'

/** Convert any frequency amount to a monthly equivalent */
export { toMonthlyAmount } from '@/lib/recurrenceFrequency'

/** Format a date string as a readable date */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Human-readable frequency label */
export function capitalize(str: string | null): string {
  if (!str) return 'Unknown'
  const labels: Record<string, string> = {
    bimonthly: 'Bimonthly',
    semiannual: 'Semi-annual',
    biweekly: 'Biweekly',
  }
  return labels[str.toLowerCase()] ?? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/** Return the confidence indicator color based on percentage threshold */
export function getConfidenceColor(percent: number): string {
  if (percent >= 80) return rawColors.app.green
  if (percent >= 50) return rawColors.app.yellow
  return rawColors.app.red
}
