import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'
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
  prefix,
}: Readonly<{
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix?: string
  prefix?: string
}>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-xs text-text-secondary">{label}</label>
        <span className="text-sm font-medium text-foreground">
          {prefix}{value.toLocaleString('en-IN')}{suffix}
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
      tooltipFormatter={formatCurrency}
      areas={[
        { key: 'Contributed', color: rawColors.app.blue, fillOpacity: 0.7 },
        { key: 'Returns', color: rawColors.app.green, fillOpacity: 0.7 },
      ]}
    />
  )
}
