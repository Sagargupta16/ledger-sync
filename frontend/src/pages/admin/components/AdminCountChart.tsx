import { useMemo } from 'react'

import StandardBarChart from '@/components/analytics/StandardBarChart'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { SEMANTIC_COLORS } from '@/constants'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'

import { formatCount, formatCountTick } from '../adminFormat'

interface Props<T extends object> {
  readonly id: string
  readonly title: string
  /** Text after the total, e.g. "sign-ups over 12 months". */
  readonly summary: string
  readonly rows: readonly T[]
  readonly labelKey: keyof T & string
  readonly valueKey: keyof T & string
  readonly seriesLabel: string
  readonly rowHeaderLabel: string
  readonly ariaLabel: string
  readonly tone: keyof typeof SEMANTIC_COLORS
}

/** A count per period (sign-ups per month, imports per day) as a small bar chart. */
export default function AdminCountChart<T extends object>({
  id,
  title,
  summary,
  rows,
  labelKey,
  valueKey,
  seriesLabel,
  rowHeaderLabel,
  ariaLabel,
  tone,
}: Props<T>) {
  const semantic = usePaletteSnapshot(SEMANTIC_COLORS)
  const total = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row[valueKey] ?? 0), 0),
    [rows, valueKey],
  )
  return (
    <section aria-labelledby={id} className="ledger-panel space-y-3 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatCount(total)} {summary}
        </p>
      </header>
      {total === 0 ? (
        <ChartEmptyState height={200} />
      ) : (
        <StandardBarChart
          data={rows}
          dataKey={labelKey}
          height={220}
          bars={[{ key: valueKey, label: seriesLabel, color: semantic[tone] }]}
          tooltipFormatter={formatCount}
          yTickFormatter={(value) => formatCountTick(Number(value))}
          rowHeaderLabel={rowHeaderLabel}
          ariaLabel={ariaLabel}
        />
      )}
    </section>
  )
}
