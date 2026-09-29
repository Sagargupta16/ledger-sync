import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatDate } from '@/lib/formatters'

import { CATEGORY_CONFIG } from '../netWorthUtils'
import type { NetWorthTrendChartProps } from './netWorthChartView'

interface NetWorthChartSummaryProps extends Pick<NetWorthTrendChartProps, 'filteredNetWorthData' | 'allCategories' | 'milestoneRows'> {
  effectiveStacked: boolean
  showProjectionLine: boolean
}

export function NetWorthChartSummary({
  filteredNetWorthData,
  allCategories,
  milestoneRows,
  effectiveStacked,
  showProjectionLine,
}: Readonly<NetWorthChartSummaryProps>) {
  const firstPoint = filteredNetWorthData[0]
  const lastPoint = filteredNetWorthData.at(-1)
  const latestValue = typeof lastPoint?.netWorth === 'number' ? lastPoint.netWorth : 0
  const openingValue = typeof firstPoint?.netWorth === 'number' ? firstPoint.netWorth : 0
  const periodChange = latestValue - openingValue
  const nextMilestone = milestoneRows?.find((row) => row.status === 'upcoming')
  let changeColor = 'text-foreground'
  if (periodChange < 0) {
    changeColor = 'text-app-red'
  } else if (periodChange > 0) {
    changeColor = 'text-app-green'
  }

  return (
    <>
      <dl className="mb-5 grid grid-cols-1 gap-4 border-y border-border/70 py-4 min-[420px]:grid-cols-2 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Cumulative net cash flow</dt>
          <dd className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight text-app-blue tabular-nums sm:text-3xl">
            {formatCurrency(latestValue)}
          </dd>
          <dd className="mt-1 font-mono text-[10px] text-muted-foreground">
            Selected range endpoint · {formatDate(String(lastPoint?.date ?? ''), { day: 'numeric', month: 'short', year: 'numeric' })}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Trend change in selected period</dt>
          <dd className={`mt-1 break-words font-mono text-lg font-semibold tabular-nums ${changeColor}`}>
            {periodChange > 0 ? '+' : ''}{formatCurrency(periodChange)}
          </dd>
          <dd className="mt-1 text-[11px] text-muted-foreground">From {formatCurrency(openingValue)}</dd>
        </div>
        {nextMilestone && (
          <div className="min-w-0 min-[420px]:col-span-2 sm:col-span-1">
            <dt className="text-xs text-muted-foreground">Next trend milestone</dt>
            <dd className="mt-1 break-words font-mono text-lg font-semibold tabular-nums text-foreground">
              {formatCurrency(nextMilestone.value)}
            </dd>
            <dd className="mt-1 text-[11px] text-muted-foreground">
              {nextMilestone.date
                ? `Estimated ${formatDate(nextMilestone.date, { month: 'short', year: 'numeric' })}`
                : 'No estimated date yet'}
            </dd>
          </div>
        )}
      </dl>
      <ChartSeriesLegend
        items={effectiveStacked
          ? allCategories.map((category) => ({
            key: category,
            label: (CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other).label,
            color: (CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other).color,
            value: formatCurrency(Number(lastPoint?.[category] ?? 0)),
          }))
          : [
            { key: 'netWorth', label: 'Net worth trend · cumulative cash flow', color: rawColors.app.blue },
            ...(showProjectionLine ? [
              { key: 'projected', label: 'Dashed · projected median', color: rawColors.app.blue },
              { key: 'projectionBand', label: 'Shaded · projection band (±1σ)', color: rawColors.app.blue },
            ] : []),
          ]}
      />
    </>
  )
}
