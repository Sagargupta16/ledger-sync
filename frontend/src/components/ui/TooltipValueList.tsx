import { formatCurrency } from '@/lib/formatters'

interface TooltipValueRow {
  readonly label: string
  readonly value: number
  /** Resolved colour of the series dot. */
  readonly color: string
}

/** Colour-keyed label and currency rows for a custom chart tooltip. */
export default function TooltipValueList({ rows }: Readonly<{ rows: readonly TooltipValueRow[] }>) {
  return (
    <dl className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
          <dt className="flex items-baseline gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
            {row.label}
          </dt>
          <dd className="font-mono text-xs font-semibold tabular-nums text-foreground">{formatCurrency(row.value)}</dd>
        </div>
      ))}
    </dl>
  )
}
