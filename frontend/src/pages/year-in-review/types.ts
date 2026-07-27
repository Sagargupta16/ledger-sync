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
const ramp = (hex: string): string[] => [
  rawColors.chart.grid,
  `${hex}33`,
  `${hex}66`,
  `${hex}A6`,
  `${hex}E6`,
]

/** Level-0 stop: no activity (or a net of exactly zero) reads as an empty cell. */
export const heatmapNeutral = rawColors.chart.grid

const expenseRamp = ramp(rawColors.app.red)
const incomeRamp = ramp(rawColors.app.green)

/**
 * Ramp per mode, split by the SIGN of the value. `net` is diverging: a surplus
 * ramps through the income hue and a deficit through the expense hue, so the
 * darkest cell on a "Savings" heatmap can no longer be the user's worst day.
 * `expense` and `income` are single-sign, so both branches share one ramp.
 */
export const heatmapRamps: Record<HeatmapMode, { surplus: string[]; deficit: string[] }> = {
  expense: { surplus: expenseRamp, deficit: expenseRamp },
  income: { surplus: incomeRamp, deficit: incomeRamp },
  net: { surplus: incomeRamp, deficit: expenseRamp },
}

export const modeAccent: Record<HeatmapMode, string> = {
  expense: rawColors.app.red,
  income: rawColors.app.green,
  net: rawColors.app.blue,
}
