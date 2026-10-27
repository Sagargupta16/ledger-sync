import { useState } from 'react'

import { Trash2 } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { Button, ConfirmDialog, Money } from '@/components/ui'
import { formatDate } from '@/lib/formatters'
import type { TaxAisSummary } from '@/services/api/taxAis'

import { taxYearLabel } from '../aisImportLabels'

interface Props {
  readonly summaries: readonly TaxAisSummary[] | undefined
  readonly isLoading: boolean
  readonly isError: boolean
  readonly isDemoMode: boolean
  readonly isRemoving: boolean
  readonly onRemove: (taxYear: string) => void
  readonly onRetry: () => void
}

const FIELDS: { key: keyof Pick<TaxAisSummary, 'tds_salary' | 'tds_other' | 'interest' | 'dividends'>; label: string }[] = [
  { key: 'tds_salary', label: 'TDS on salary' },
  { key: 'tds_other', label: 'Other TDS' },
  { key: 'interest', label: 'Interest' },
  { key: 'dividends', label: 'Dividends' },
]

/** The totals already saved, one card per tax year, each removable. */
export default function SavedAisYears({ summaries, isLoading, isError, isDemoMode, isRemoving, onRemove, onRetry }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  if (isLoading) return null
  return (
    <section aria-labelledby="ais-saved-title" className="space-y-3">
      <h2 id="ais-saved-title" className="text-base font-semibold">Saved AIS totals</h2>
      {isError && <ErrorState variant="inline" message="The saved totals could not be loaded." onRetry={onRetry} />}
      {!isError && (summaries?.length ?? 0) === 0 && (
        <EmptyState variant="compact" title="Nothing saved yet" description="Open an AIS above and save its totals." />
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {summaries?.map((summary) => (
          <li key={summary.tax_year} className="ledger-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{taxYearLabel(summary.tax_year)}</h3>
                <p className="text-xs text-muted-foreground">Saved {formatDate(new Date(summary.updated_at))}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" aria-hidden="true" />}
                aria-label={`Remove the AIS totals for ${taxYearLabel(summary.tax_year)}`}
                disabled={isDemoMode || isRemoving}
                onClick={() => setPending(summary.tax_year)}
              />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {FIELDS.map((field) => (
                <div key={field.key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="mt-0.5 text-sm"><Money value={summary[field.key]} /></dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => { if (!open) setPending(null) }}
        title="Remove these AIS totals?"
        description={pending ? `/tax stops showing actual TDS for ${taxYearLabel(pending)} until you import its AIS again.` : ''}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (pending) onRemove(pending)
          setPending(null)
        }}
      />
    </section>
  )
}
