import type { ReactNode } from 'react'
import type { DefaultTooltipContentProps } from 'recharts'

import { CHART_TEXT } from '@/constants/chartColors'

import { CHART_TOOLTIP_STYLE } from './ChartTooltip'

interface ChartTooltipContentProps extends DefaultTooltipContentProps {
  readonly active?: boolean
  readonly shareTotal?: number
}

/**
 * One reading order across chart families: period, series, exact value.
 * Recharts still owns activation, keyboard navigation, payloads and formatting.
 */
export default function ChartTooltipContent({
  active,
  payload = [],
  label,
  formatter,
  labelFormatter,
  itemSorter,
  shareTotal,
  accessibilityLayer = false,
}: ChartTooltipContentProps) {
  if (!active || payload.length === 0) return null

  const entries = payload.filter((entry) => entry.type !== 'none' && entry.value != null)
  if (entries.length === 0) return null

  if (itemSorter) {
    const sortValue = (entry: (typeof entries)[number]) => {
      const value = typeof itemSorter === 'function' ? itemSorter(entry) : entry[itemSorter]
      return typeof value === 'number' || typeof value === 'string' ? value : ''
    }
    entries.sort((a, b) => {
      const left = sortValue(a)
      const right = sortValue(b)
      if (typeof left === 'number' && typeof right === 'number') return left - right
      return String(left).localeCompare(String(right))
    })
  }

  const heading = label == null ? null : (labelFormatter?.(label, payload) ?? label)
  const Container = accessibilityLayer ? 'output' : 'div'

  return (
    <Container
      className="block"
      role={accessibilityLayer ? undefined : 'tooltip'}
      aria-live={accessibilityLayer ? 'assertive' : undefined}
      style={CHART_TOOLTIP_STYLE}
    >
      {heading != null && heading !== '' && (
        <span className="mb-2 block border-b border-border/60 pb-2 text-xs font-medium text-muted-foreground">
          {heading}
        </span>
      )}
      <span className="block space-y-2.5">
        {entries.map((entry, index) => {
          const format = entry.formatter ?? formatter
          const formatted = format?.(entry.value, entry.name, entry, index, payload)
          if (format && formatted == null) return null
          const defaultValue = Array.isArray(entry.value) ? entry.value.join(' / ') : entry.value
          let value: ReactNode = formatted ?? defaultValue
          let name: ReactNode = entry.name
          if (Array.isArray(formatted)) [value, name] = formatted
          const color = entry.color ?? CHART_TEXT.muted
          const share = shareTotal && shareTotal > 0 && typeof entry.value === 'number'
            ? `${((entry.value / shareTotal) * 100).toFixed(1)}% of total`
            : null

          return (
            <span
              key={`${entry.graphicalItemId ?? entry.name ?? 'series'}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 gap-y-0.5"
            >
              <span className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground">
                <span
                  className="size-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="break-words">{name}</span>
              </span>
              <span className="text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                {value}{entry.unit}
              </span>
              {share && (
                <span className="col-span-2 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                  {share}
                </span>
              )}
            </span>
          )
        })}
      </span>
    </Container>
  )
}
