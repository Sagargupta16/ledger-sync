import { useState } from 'react'

import { chartDateKey } from '@/lib/chartDateLabels'
import { addMonthsToKey } from '@/lib/dateUtils'

export interface ChartRange {
  startIndex: number
  endIndex: number
}

export interface ChartRangePreset extends ChartRange {
  label: string
}

function rangePresets(labels: readonly string[]): ChartRangePreset[] {
  const endIndex = Math.max(0, labels.length - 1)
  const all = { label: 'All', startIndex: 0, endIndex }
  if (labels.length < 2) return [all]
  const dates = labels.map(chartDateKey)
  const last = dates.at(-1)
  if (!last || dates.some((date, index) => !date || (index > 0 && date < dates[index - 1]!))) {
    // Numeric projection years and non-date buckets still get useful zoom.
    const count = Math.ceil(labels.length / 2)
    return [all, { label: `Last ${count}`, startIndex: labels.length - count, endIndex }]
  }
  const candidates = [1, 3, 6, 12, 36].flatMap((months) => {
    const cutoff = addMonthsToKey(last, -months)
    const startIndex = dates.findIndex((date) => date! > cutoff)
    return startIndex > 0 && startIndex < endIndex
      ? [{ label: months >= 12 ? `${months / 12}Y` : `${months}M`, startIndex, endIndex }]
      : []
  })
  const years = candidates.filter((preset) => preset.label.endsWith('Y'))
  const relevant = years.length ? years : candidates.slice(-2)
  return [all, ...relevant.filter((preset, index) =>
    relevant.findIndex((other) => other.startIndex === preset.startIndex) === index,
  )]
}

/**
 * Plot-only zoom. Keep the complete source data in Recharts and its data table;
 * never use the selected indices to recompute a financial result.
 */
export function useChartRange(labels: readonly string[]) {
  // A new array with the same dates (FX, motion, or value refresh) keeps zoom.
  // A changed date domain resets to All without an effect or a stale render.
  const domain = JSON.stringify(labels)
  const [selection, setSelection] = useState<(ChartRange & { domain: string }) | null>(null)
  const endIndex = Math.max(0, labels.length - 1)
  const range: ChartRange = selection?.domain === domain
    ? selection
    : { startIndex: 0, endIndex }
  const setRange = (next: Partial<ChartRange>) => {
    const clamp = (value: number) => Math.max(0, Math.min(endIndex, Math.round(value)))
    const start = clamp(Number.isFinite(next.startIndex) ? next.startIndex! : range.startIndex)
    const end = clamp(Number.isFinite(next.endIndex) ? next.endIndex! : range.endIndex)
    setSelection({ domain, startIndex: Math.min(start, end), endIndex: Math.max(start, end) })
  }
  return {
    labels,
    ...range,
    presets: rangePresets(labels),
    setRange,
    reset: () => setSelection(null),
    isAll: range.startIndex === 0 && range.endIndex === endIndex,
  }
}

export type ChartRangeControl = ReturnType<typeof useChartRange>
