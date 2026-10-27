import { memo, useMemo } from 'react'

import StandardAreaChart from '@/components/analytics/StandardAreaChart'
import StandardBarChart from '@/components/analytics/StandardBarChart'
import StandardPieChart from '@/components/analytics/StandardPieChart'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { CHART_COLORS, SEMANTIC_COLORS } from '@/constants'

import type { ChartSeries, ChartSpec, ValueFormat } from '../chartSpec'

const CHART_HEIGHT = 300

/** Series whose name says what they are take the app's semantic colours. */
const SEMANTIC_MATCHERS: ReadonlyArray<[RegExp, keyof typeof SEMANTIC_COLORS]> = [
  [/income|earn|salary/i, 'income'],
  [/expense|spend|spent|cost/i, 'expense'],
  [/saving/i, 'savings'],
  [/invest/i, 'investment'],
  [/transfer/i, 'transfer'],
]

function seriesColors(
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

function valueFormatter(format: ValueFormat): (value: number) => string {
  if (format === 'percent') return (value) => formatPercent(value)
  if (format === 'number') return (value) => value.toLocaleString('en-IN')
  return formatCurrency
}

function tickFormatter(format: ValueFormat): (value: string | number) => string {
  if (format === 'percent') return (value) => formatPercent(Number(value), false, 0)
  if (format === 'number') return (value) => Number(value).toLocaleString('en-IN')
  return (value) => formatCurrencyShort(Number(value))
}

/** One canvas chart, drawn with the kit's standard wrappers. */
function CanvasChart({ spec }: Readonly<{ spec: ChartSpec }>) {
  const palette = usePaletteSnapshot(CHART_COLORS)
  const semantic = usePaletteSnapshot(SEMANTIC_COLORS)
  const colors = useMemo(() => seriesColors(spec.series, palette, semantic), [spec.series, palette, semantic])
  const format = valueFormatter(spec.valueFormat)
  const ticks = tickFormatter(spec.valueFormat)
  const ariaLabel = spec.subtitle ? `${spec.title}. ${spec.subtitle}` : spec.title

  if (spec.chartType === 'pie') {
    const key = spec.series[0].key
    const slices = spec.data.map((row, index) => ({
      name: String(row[spec.xKey]),
      value: Number(row[key]),
      color: palette[index % palette.length],
    }))
    return (
      <StandardPieChart
        data={slices}
        height={CHART_HEIGHT}
        tooltipFormatter={format}
        centerLabel={spec.series[0].label}
        ariaLabel={ariaLabel}
      />
    )
  }

  if (spec.chartType === 'line' || spec.chartType === 'area') {
    const showFill = spec.chartType === 'area'
    return (
      <StandardAreaChart
        data={spec.data}
        dataKey={spec.xKey}
        areas={spec.series.map((entry, index) => ({
          key: entry.key,
          label: entry.label,
          color: colors[index],
          showFill,
        }))}
        height={CHART_HEIGHT}
        showLegend={spec.series.length > 1}
        tooltipFormatter={format}
        showBrush={spec.data.length > 12}
        ariaLabel={ariaLabel}
      />
    )
  }

  const isRanking = spec.chartType === 'horizontal_bar'
  return (
    <StandardBarChart
      data={spec.data}
      dataKey={spec.xKey}
      layout={isRanking ? 'vertical' : 'horizontal'}
      yCategoryKey={isRanking ? spec.xKey : undefined}
      bars={spec.series.map((entry, index) => ({ key: entry.key, label: entry.label, color: colors[index] }))}
      height={isRanking ? Math.max(CHART_HEIGHT, spec.data.length * 32) : CHART_HEIGHT}
      showLegend={spec.series.length > 1}
      tooltipFormatter={format}
      xTickFormatter={isRanking ? ticks : undefined}
      yTickFormatter={isRanking ? undefined : ticks}
      ariaLabel={ariaLabel}
      rowHeaderLabel={spec.xLabel}
    />
  )
}

export default memo(CanvasChart)
