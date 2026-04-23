import { rawColors } from '@/constants/colors'

export type HeatmapMode = 'expense' | 'income' | 'net'

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export const heatmapColors: Record<HeatmapMode, string[]> = {
  expense: [
    'rgba(255,255,255,0.04)',
    'rgba(239,68,68,0.20)',
    'rgba(239,68,68,0.40)',
    'rgba(239,68,68,0.65)',
    'rgba(239,68,68,0.90)',
  ],
  income: [
    'rgba(255,255,255,0.04)',
    'rgba(34,197,94,0.20)',
    'rgba(34,197,94,0.40)',
    'rgba(34,197,94,0.65)',
    'rgba(34,197,94,0.90)',
  ],
  net: [
    'rgba(255,255,255,0.04)',
    'rgba(59,130,246,0.20)',
    'rgba(59,130,246,0.40)',
    'rgba(59,130,246,0.65)',
    'rgba(59,130,246,0.90)',
  ],
}

export const modeAccent: Record<HeatmapMode, string> = {
  expense: rawColors.app.red,
  income: rawColors.app.green,
  net: rawColors.app.blue,
}
