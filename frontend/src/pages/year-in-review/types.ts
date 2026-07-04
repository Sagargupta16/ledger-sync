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

/**
 * Heatmap stops built from the APP palette (not tailwind-slate). Alpha suffix
 * as 8-bit hex: 33 = 20%, 66 = 40%, A6 = 65%, E6 = 90%. Using the raw hex
 * (rawColors.app.*) lets light-theme AA-adjusted values flow through
 * automatically -- the previous literal `rgba(239,68,68,...)` etc. bypassed
 * theme flip entirely.
 */
export const heatmapColors: Record<HeatmapMode, string[]> = {
  expense: [
    rawColors.chart.grid,
    `${rawColors.app.red}33`,
    `${rawColors.app.red}66`,
    `${rawColors.app.red}A6`,
    `${rawColors.app.red}E6`,
  ],
  income: [
    rawColors.chart.grid,
    `${rawColors.app.green}33`,
    `${rawColors.app.green}66`,
    `${rawColors.app.green}A6`,
    `${rawColors.app.green}E6`,
  ],
  net: [
    rawColors.chart.grid,
    `${rawColors.app.blue}33`,
    `${rawColors.app.blue}66`,
    `${rawColors.app.blue}A6`,
    `${rawColors.app.blue}E6`,
  ],
}

export const modeAccent: Record<HeatmapMode, string> = {
  expense: rawColors.app.red,
  income: rawColors.app.green,
  net: rawColors.app.blue,
}
