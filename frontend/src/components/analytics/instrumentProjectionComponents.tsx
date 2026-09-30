import { rawColors } from '@/constants/colors'
import { formatCurrency, getActiveLocale } from '@/lib/formatters'
import StandardAreaChart from '@/components/analytics/StandardAreaChart'
import type { ProjectionResult } from '@/lib/instrumentCalculators'

import { toChartData } from './instrumentProjectionUtils'

export function SliderInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  formatValue,
}: Readonly<{
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix?: string
  /** Renders the value (e.g. the shared currency formatter); overrides `suffix`. */
  formatValue?: (value: number) => string
}>) {
  // Grouping follows the display currency's locale, like every other figure.
  const display = formatValue
    ? formatValue(value)
    : `${value.toLocaleString(getActiveLocale())}${suffix ?? ''}`
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-xs text-text-secondary">{label}</label>
        <span className="text-sm font-medium text-foreground">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={display}
        className="touch-slider"
      />
    </div>
  )
}

export function ProjectionChart({ data }: Readonly<{ data: ProjectionResult }>) {
  const chartData = toChartData(data)

  return (
    <StandardAreaChart
      data={chartData}
      dataKey="year"
      height={280}
      stacked
      ariaLabel="Projected account value by year, split between contributions and returns"
      tooltipFormatter={formatCurrency}
      areas={[
        { key: 'Contributed', color: rawColors.app.blue, fillOpacity: 0.7 },
        { key: 'Returns', color: rawColors.app.green, fillOpacity: 0.7 },
      ]}
    />
  )
}
