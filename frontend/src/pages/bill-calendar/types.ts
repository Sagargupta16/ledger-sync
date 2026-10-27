import type { CardCycleStatus } from '@/services/api/cardCycles'

export interface PlacedBill {
  key: string
  name: string
  amount: number
  category: string
  frequency: string | null
  type: string | null
  day: number
  /**
   * `card` is a credit card statement's due date from `/api/card-cycles`;
   * `tax` an advance tax instalment date, which carries no amount.
   */
  source: 'detected' | 'confirmed' | 'card' | 'tax'
  /** Card due dates only: where that statement stands. */
  cardStatus?: CardCycleStatus
  /**
   * A marker that asks for no money: a paid card statement, or an open cycle's
   * spend so far. It stays on the calendar but out of every total.
   */
  informational?: boolean
  /** Replaces the frequency in the day panel's second line. */
  note?: string
  /** Where the amount is worked out, for a marker that carries none. */
  href?: string
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Re-exported from the canonical map so any code already importing
// from this file keeps working. New code should import directly from
// ``@/constants/categoryColors``.
export { EXPENSE_CATEGORY_COLORS as CATEGORY_COLORS } from '@/constants/categoryColors'
