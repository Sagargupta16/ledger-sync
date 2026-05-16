export interface PlacedBill {
  key: string
  name: string
  amount: number
  category: string
  frequency: string | null
  type: string | null
  day: number
  source: 'detected' | 'confirmed'
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Re-exported from the canonical map so any code already importing
// from this file keeps working. New code should import directly from
// ``@/constants/categoryColors``.
export { EXPENSE_CATEGORY_COLORS as CATEGORY_COLORS } from '@/constants/categoryColors'
