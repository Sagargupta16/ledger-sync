import { rawColors } from '@/constants/colors'

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

export const CATEGORY_COLORS: Record<string, string> = {
  'Bills & Utilities': rawColors.app.blue,
  'Entertainment': rawColors.app.purple,
  'Food & Dining': rawColors.app.orange,
  'Insurance': rawColors.app.teal,
  'Shopping': rawColors.app.pink,
  'Transportation': rawColors.app.yellow,
  'Health & Fitness': rawColors.app.green,
  'Education': rawColors.app.indigo,
}
