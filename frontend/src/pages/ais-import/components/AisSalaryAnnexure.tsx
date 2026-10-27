import type { AisAnnexure } from '@/lib/tax/aisTypes'

interface Props {
  readonly entries: readonly AisAnnexure[]
}

/** Annexure II of Form 24Q as the employer reported it, label by label. */
export default function AisSalaryAnnexure({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">This statement has no salary annexure.</p>
  }
  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <section key={entry.key} aria-label={`${entry.description}: ${entry.source}`} className="rounded-lg border border-border p-3">
          <h4 className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{entry.source}</h4>
          <p className="text-xs text-muted-foreground">{entry.description}</p>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {entry.fields.map((field) => (
              <div key={field.label} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[var(--hairline-1)] pb-1.5">
                <dt className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{field.label}</dt>
                <dd className="ledger-figure shrink-0 text-right text-sm tabular-nums text-foreground">{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
