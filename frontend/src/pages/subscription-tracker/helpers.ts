import { rawColors } from '@/constants/colors'

// ---------------------------------------------------------------------------
// Frequency / cost helpers
// ---------------------------------------------------------------------------

/** Frequency label to annual multiplier */
export function getAnnualFactor(frequency: string | null): number {
  switch (frequency?.toLowerCase()) {
    case 'weekly':
      return 52
    case 'fortnightly':
    case 'biweekly':
      return 26
    case 'monthly':
      return 12
    case 'bimonthly':
      return 6
    case 'quarterly':
      return 4
    case 'semiannual':
      return 2
    case 'yearly':
    case 'annually':
      return 1
    default:
      return 12
  }
}

/** Convert any frequency amount to a monthly equivalent */
export function toMonthlyAmount(amount: number, frequency: string | null): number {
  const annualFactor = getAnnualFactor(frequency)
  return (Math.abs(amount) * annualFactor) / 12
}

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
