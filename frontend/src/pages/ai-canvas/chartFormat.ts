import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'

import type { ChartSpec, ValueFormat } from './chartSpec'

/** Full values: tooltips and the table view. */
export function valueFormatter(format: ValueFormat): (value: number) => string {
  if (format === 'percent') return (value) => formatPercent(value)
  if (format === 'number') return (value) => value.toLocaleString('en-IN')
  return formatCurrency
}

/** Compact axis ticks. */
export function tickFormatter(format: ValueFormat): (value: string | number) => string {
  if (format === 'percent') return (value) => formatPercent(Number(value), false, 0)
  if (format === 'number') return (value) => Number(value).toLocaleString('en-IN')
  return (value) => formatCurrencyShort(Number(value))
}

const MONTH_LABEL = /^\d{4}-(0[1-9]|1[0-2])$/

/** One-tap follow-ups for a chart: other forms of the same data the model can redraw. */
export function followUps(spec: ChartSpec): string[] {
  const asks: string[] = []
  const monthly = spec.data.every((row) => MONTH_LABEL.test(String(row[spec.xKey])))
  if (spec.chartType === 'pie') asks.push('as a ranking')
  if (spec.chartType === 'horizontal_bar' && spec.series.length === 1 && spec.data.length <= 7) asks.push('as a pie chart')
  if (monthly && spec.chartType !== 'line') asks.push('as a line chart')
  if (monthly && spec.chartType !== 'bar') asks.push('as a bar chart')
  if (monthly && spec.data.length >= 6) asks.push('grouped by quarter')
  return asks.slice(0, 3).map((phrase) => `Redraw "${spec.title}" ${phrase}`)
}
