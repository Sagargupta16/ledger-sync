import { rawColors } from '@/constants/colors'
import { CONFIRMED_SUBS_KEY, MANUAL_SUBS_KEY } from './types'
import type { ManualSubscription } from './types'

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

export function loadConfirmedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CONFIRMED_SUBS_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function saveConfirmedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(CONFIRMED_SUBS_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage full or unavailable; ignore
  }
}

export function loadManualSubscriptions(): ManualSubscription[] {
  try {
    const raw = localStorage.getItem(MANUAL_SUBS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ManualSubscription[]
  } catch {
    return []
  }
}

export function saveManualSubscriptions(subs: ManualSubscription[]): void {
  try {
    localStorage.setItem(MANUAL_SUBS_KEY, JSON.stringify(subs))
  } catch {
    // Storage full or unavailable; ignore
  }
}

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
    case 'quarterly':
      return 4
    case 'yearly':
    case 'annually':
      return 1
    default:
      return 12 // default to monthly if unknown
  }
}

/** Expected interval in days for a given frequency */
export function getExpectedIntervalDays(frequency: string | null): number {
  switch (frequency?.toLowerCase()) {
    case 'weekly':
      return 7
    case 'fortnightly':
    case 'biweekly':
      return 14
    case 'monthly':
      return 30
    case 'quarterly':
      return 90
    case 'yearly':
    case 'annually':
      return 365
    default:
      return 30
  }
}

/** Convert any frequency amount to a monthly equivalent */
export function toMonthlyAmount(amount: number, frequency: string | null): number {
  const annualFactor = getAnnualFactor(frequency)
  return (Math.abs(amount) * annualFactor) / 12
}

/** Determine status based on last occurrence and expected frequency */
export function getSubscriptionStatus(
  lastOccurrence: string | null,
  frequency: string | null,
): 'active' | 'possibly_inactive' {
  if (!lastOccurrence) return 'possibly_inactive'
  const daysSinceLast = (Date.now() - new Date(lastOccurrence).getTime()) / (1000 * 60 * 60 * 24)
  const expectedInterval = getExpectedIntervalDays(frequency)
  return daysSinceLast > expectedInterval * 2 ? 'possibly_inactive' : 'active'
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

/** Capitalize first letter of a string */
export function capitalize(str: string | null): string {
  if (!str) return 'Unknown'
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/** Return the confidence indicator color based on percentage threshold */
export function getConfidenceColor(percent: number): string {
  if (percent >= 80) return rawColors.ios.green
  if (percent >= 50) return rawColors.ios.yellow
  return rawColors.ios.red
}
