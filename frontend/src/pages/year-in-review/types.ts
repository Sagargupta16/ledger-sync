import { colors, cssVar } from '@/constants/colors'

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

/** Translucent tint of a CSS color reference, resolved by the browser. */
export const tint = (color: string, percent: number): string =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`

/**
 * Heatmap stops built from the APP palette (not tailwind-slate) at 20%, 40%,
 * 65% and 90%. Every stop is a `var()` reference mixed in CSS, and the heatmap
 * only paints DOM, so cells, legend and controls follow a theme toggle with no
 * re-render. Resolved hex copied at import froze the load-time theme.
 */
const ramp = (color: string): string[] => [
  cssVar('--chart-grid'),
  tint(color, 20),
  tint(color, 40),
  tint(color, 65),
  tint(color, 90),
]

/** Level-0 stop: no activity (or a net of exactly zero) reads as an empty cell. */
export const heatmapNeutral = cssVar('--chart-grid')

const expenseRamp = ramp(colors.app.red)
const incomeRamp = ramp(colors.app.green)

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
  expense: colors.app.red,
  income: colors.app.green,
  net: colors.app.blue,
}
