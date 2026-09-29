import type { TooltipContentProps } from 'recharts'

import { CHART_TOOLTIP_STYLE } from '@/components/ui/ChartTooltip'
import { tooltipLabelString } from '@/lib/chartUtils'
import { formatCurrency, formatDate } from '@/lib/formatters'

export function NetWorthTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null

  return (
    <div role="tooltip" style={CHART_TOOLTIP_STYLE}>
      <p className="mb-3 border-b border-border/60 pb-2 text-xs font-medium text-foreground">
        {formatDate(tooltipLabelString(label), { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
      <dl className="space-y-2.5">
        {payload.filter((item) => item.value != null).map((item) => (
          <div key={String(item.dataKey)} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
            <dt className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
              {item.name}
            </dt>
            <dd className="flex flex-wrap gap-x-1 font-mono text-xs font-semibold tabular-nums text-foreground">
              {Array.isArray(item.value)
                ? <><span>{formatCurrency(Number(item.value[0]))}</span><span>to</span><span>{formatCurrency(Number(item.value[1]))}</span></>
                : formatCurrency(Number(item.value))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
