import type { SEMANTIC_COLORS } from '@/constants'

import type { ChartSeries } from '../chartSpec'

/** Series whose name says what they are take the app's semantic colours. */
const SEMANTIC_MATCHERS: ReadonlyArray<[RegExp, keyof typeof SEMANTIC_COLORS]> = [
  [/income|earn|salary/i, 'income'],
  [/expense|spend|spent|cost/i, 'expense'],
  [/saving/i, 'savings'],
  [/invest/i, 'investment'],
  [/transfer/i, 'transfer'],
]

/** One colour per series: a semantic colour when the name asks for one, else the next unused palette colour. */
export function seriesColors(
  series: readonly ChartSeries[],
  palette: readonly string[],
  semantic: typeof SEMANTIC_COLORS,
): string[] {
  const used = new Set<string>()
  return series.map((entry, index) => {
    const name = `${entry.key} ${entry.label}`
    const match = SEMANTIC_MATCHERS.find(([pattern]) => pattern.test(name))
    const preferred = match ? semantic[match[1]] : undefined
    const color =
      preferred && !used.has(preferred)
        ? preferred
        : (palette.find((candidate) => !used.has(candidate)) ?? palette[index % palette.length])
    used.add(color)
    return color
  })
}

/** Everything a canvas renderer needs besides the spec. */
export interface CanvasChartProps {
  readonly colors: readonly string[]
  readonly palette: readonly string[]
  readonly semantic: typeof SEMANTIC_COLORS
  readonly format: (value: number) => string
  readonly ticks: (value: string | number) => string
  readonly ariaLabel: string
}

export const CANVAS_CHART_HEIGHT = 300

/** The kit's tick sizes: 10px on phones, 11px elsewhere. */
export function tickFont(isMobile: boolean): number {
  return isMobile ? 10 : 11
}
