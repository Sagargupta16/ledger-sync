import { colors, rawColors } from '@/constants/colors'

type AppColor = keyof typeof colors.app

/**
 * Palette key per GST slab. Colors are resolved on READ, never copied at
 * import: a map of resolved values built at module load kept the old theme's
 * hex after a toggle, so the rate-mix pie and bars repainted in the wrong
 * theme. Unknown slabs fall back to blue.
 */
const GST_SLAB_COLOR_KEYS: Record<number, AppColor> = {
  0: 'green',
  3: 'yellow',
  5: 'teal',
  12: 'blue',
  18: 'indigo',
  28: 'orange',
  40: 'red',
}

const slabKey = (slab: number): AppColor => GST_SLAB_COLOR_KEYS[slab] ?? 'blue'

/** Resolved color for Recharts/SVG fills. Read at render, after any theme refresh. */
export function gstSlabColor(slab: number): string {
  return rawColors.app[slabKey(slab)]
}

/** CSS var() for DOM styles, which follow a theme toggle on their own. */
export function gstSlabCssColor(slab: number): string {
  return colors.app[slabKey(slab)]
}
