import ProgressBar from '@/components/shared/ProgressBar'

import { formatCount } from '../adminFormat'

interface Row {
  readonly key: string
  readonly label: string
  readonly value: number
}

interface Props {
  readonly id: string
  readonly title: string
  readonly rows: readonly Row[]
  readonly note?: string
}

/** A short labelled split (sign-in providers, transaction types) with each row's share. */
export default function AdminBreakdown({ id, title, rows, note }: Props) {
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return (
    <section aria-labelledby={id} className="ledger-panel space-y-3 p-4">
      <h2 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-foreground">{row.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCount(row.value)}
                <span className="ml-2 text-xs">
                  {total > 0 ? `${Math.round((row.value / total) * 100)}%` : '0%'}
                </span>
              </span>
            </div>
            <ProgressBar value={row.value} max={Math.max(total, 1)} ariaLabel={`${row.label}: ${formatCount(row.value)}`} />
          </li>
        ))}
      </ul>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </section>
  )
}
