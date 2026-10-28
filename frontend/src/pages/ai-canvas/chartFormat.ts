import { formatCurrency, formatCurrencyCompact, formatCurrencyShort, formatPercent } from '@/lib/formatters'

import type { ChartSpec, ValueFormat } from './chartSpec'

/** Full values: tooltips and the table view. Whole rupees read without ".00"; paise stay. */
export function valueFormatter(format: ValueFormat): (value: number) => string {
  if (format === 'percent') return (value) => formatPercent(value)
  if (format === 'number') return (value) => value.toLocaleString('en-IN')
  return (value) => (Number.isInteger(value) ? formatCurrencyCompact(value) : formatCurrency(value))
}

/** Compact axis ticks. */
export function tickFormatter(format: ValueFormat): (value: string | number) => string {
  if (format === 'percent') return (value) => formatPercent(Number(value), false, 0)
  if (format === 'number') return (value) => Number(value).toLocaleString('en-IN')
  return (value) => formatCurrencyShort(Number(value))
}

const MONTH_LABEL = /^\d{4}-(0[1-9]|1[0-2])$/

/** Other forms of a time series: the line and bar views it is not, plus a coarser grain. */
function timeSeriesAsks(spec: ChartSpec): string[] {
  const asks: string[] = []
  const stacked = spec.chartType === 'stacked_bar' || spec.chartType === 'stacked_area'
  if (spec.chartType !== 'line') asks.push('as a line chart')
  if (spec.chartType !== 'bar' && !stacked) asks.push('as a bar chart')
  if (spec.chartType === 'stacked_bar') asks.push('as a stacked area chart')
  if (spec.chartType === 'stacked_area') asks.push('as a stacked bar chart')
  if (spec.data.length >= 6) asks.push('grouped by quarter')
  return asks
}

/** Other forms of parts of a whole or a ranking. */
function partsAsks(spec: ChartSpec): string[] {
  const few = spec.series.length === 1 && spec.data.length <= 7
  switch (spec.chartType) {
    case 'pie':
    case 'donut':
      return ['as a ranking', 'as a treemap']
    case 'treemap':
    case 'radar':
      return ['as a ranking']
    case 'horizontal_bar':
      return few ? ['as a pie chart'] : ['as a treemap']
    default:
      return []
  }
}

const TIME_SERIES = new Set(['bar', 'line', 'area', 'stacked_bar', 'stacked_area'])

/** One-tap follow-ups for a chart: other forms of the same data the model can redraw. */
export function followUps(spec: ChartSpec): string[] {
  const monthly = spec.data.length > 0 && spec.data.every((row) => MONTH_LABEL.test(String(row[spec.xKey])))
  let asks = partsAsks(spec)
  if (monthly && TIME_SERIES.has(spec.chartType)) asks = timeSeriesAsks(spec)
  else if (spec.chartType === 'waterfall' || spec.chartType === 'slope') asks = ['as a bar chart']
  return asks.slice(0, 3).map((phrase) => `Redraw "${spec.title}" ${phrase}`)
}
