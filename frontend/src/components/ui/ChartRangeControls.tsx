import { useId, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { formatChartDate } from '@/lib/chartDateLabels'

import Button from './Button'
import type { ChartRangeControl } from './useChartRange'

interface Props {
  readonly range: ChartRangeControl
  readonly label?: string
}

export default function ChartRangeControls({ range, label = 'Chart range' }: Props) {
  const id = useId()
  const [customOpen, setCustomOpen] = useState(false)
  const { labels, startIndex, endIndex, presets, setRange, reset, isAll } = range
  if (labels.length < 2) return null
  const count = endIndex - startIndex + 1
  const activePreset = presets.find((preset) => preset.startIndex === startIndex && preset.endIndex === endIndex)
  const move = (direction: number) => {
    const nextStart = Math.max(0, Math.min(labels.length - count, startIndex + direction * count))
    setRange({ startIndex: nextStart, endIndex: nextStart + count - 1 })
  }
  const rangeInputClass = 'w-full min-w-0 min-h-11 cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <fieldset className="m-0 mb-3 min-w-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant={activePreset === preset ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={activePreset === preset}
              onClick={() => setRange(preset)}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={customOpen}
            aria-controls={`${id}-custom`}
            onClick={() => setCustomOpen(!customOpen)}
          >
            Custom
          </Button>
          <Button variant="ghost" size="sm" onClick={reset} disabled={isAll}>
            Reset
          </Button>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" aria-label="Show earlier dates" disabled={startIndex === 0} onClick={() => move(-1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Show later dates" disabled={endIndex === labels.length - 1} onClick={() => move(1)}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs tabular-nums text-muted-foreground" aria-live="polite" aria-atomic="true">
        <span className="font-medium text-foreground">{isAll ? 'All dates' : activePreset?.label ?? 'Custom range'}</span>
        {' · '}{formatChartDate(labels[startIndex])}
        {startIndex !== endIndex && ` to ${formatChartDate(labels[endIndex])}`}
        {' · '}{count} of {labels.length} points
      </p>
      <div id={`${id}-custom`} hidden={!customOpen} className="mt-3 grid min-w-0 gap-x-6 gap-y-2 rounded-lg border border-border/60 px-3 py-2 sm:grid-cols-2">
        <label className="min-w-0 text-xs text-muted-foreground" htmlFor={`${id}-start`}>
          Start: {formatChartDate(labels[startIndex])}
          <input
            id={`${id}-start`}
            type="range"
            aria-label="Range start"
            aria-valuetext={formatChartDate(labels[startIndex])}
            min={0}
            max={endIndex}
            value={startIndex}
            onChange={(event) => setRange({ startIndex: Number(event.target.value) })}
            className={rangeInputClass}
          />
        </label>
        <label className="min-w-0 text-xs text-muted-foreground" htmlFor={`${id}-end`}>
          End: {formatChartDate(labels[endIndex])}
          <input
            id={`${id}-end`}
            type="range"
            aria-label="Range end"
            aria-valuetext={formatChartDate(labels[endIndex])}
            min={startIndex}
            max={labels.length - 1}
            value={endIndex}
            onChange={(event) => setRange({ endIndex: Number(event.target.value) })}
            className={rangeInputClass}
          />
        </label>
      </div>
    </fieldset>
  )
}
