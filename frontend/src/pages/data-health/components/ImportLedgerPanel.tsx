import { FileClock } from 'lucide-react'

import { DataTable, type DataTableColumn } from '@/components/ui'
import { formatDate, getActiveLocale } from '@/lib/formatters'

import type { ImportLedgerRow } from '../types'

interface ImportLedgerPanelProps {
  readonly rows: readonly ImportLedgerRow[]
  readonly fileName: string | null
  readonly importedAt: string | null
}

/**
 * What the most recent import did, row by row.
 *
 * The importer reports these counts once in a post-upload toast and then the app
 * forgets them, so a run that skipped a third of the file leaves no trace. Rows
 * skipped in particular is invisible everywhere else, yet those rows are missing
 * from every metric on every page.
 */
function OutcomeCell({ row }: { readonly row: ImportLedgerRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
      <p className="text-xs text-text-tertiary">{row.hint}</p>
    </div>
  )
}

function RowCountCell({ count, locale }: { readonly count: number; readonly locale: string }) {
  return (
    <span className="text-sm font-semibold tabular-nums text-foreground">
      {count.toLocaleString(locale)}
    </span>
  )
}

/**
 * `locale` stays a parameter rather than being read here: `getActiveLocale()`
 * depends on user preferences, so resolving it at module scope would freeze the
 * first value the module ever saw.
 */
function buildColumns(locale: string): readonly DataTableColumn<ImportLedgerRow>[] {
  return [
    {
      key: 'label',
      header: 'Outcome',
      mobilePrimary: true,
      cell: (row) => <OutcomeCell row={row} />,
    },
    {
      key: 'count',
      header: 'Rows',
      align: 'right',
      widthClass: 'w-24',
      mobileLabel: 'Rows',
      cell: (row) => <RowCountCell count={row.count} locale={locale} />,
    },
  ]
}

/**
 * `importedAt` is a naive UTC timestamp, so it is read as UTC and the day shown
 * is the viewer's. Its leading `YYYY-MM-DD` is the UTC day, which is the previous
 * day for an IST import before 05:30.
 */
function formatImportedDay(iso: string): string {
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(date.getTime()) ? iso : formatDate(date)
}

export default function ImportLedgerPanel({ rows, fileName, importedAt }: ImportLedgerPanelProps) {
  const locale = getActiveLocale()

  // No import has ever run, so there are no counts to explain. The freshness
  // banner above already says so; a table of zeroes would just add noise.
  if (rows.length === 0) return null

  return (
    <section className="space-y-3 sm:rounded-lg sm:border sm:border-[var(--glass-border)] sm:bg-surface-1 sm:p-4 sm:shadow-[var(--glass-shadow)]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <FileClock className="size-4 shrink-0 self-center text-app-blue" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Last import</h2>
        <span className="flex min-w-0 max-w-full items-baseline gap-x-1 text-xs text-text-tertiary">
          <span className="min-w-0 truncate" title={fileName ?? undefined}>
            {fileName ?? 'No file on record'}
          </span>
          {importedAt && <span className="shrink-0">{`-- ${formatImportedDay(importedAt)}`}</span>}
        </span>
      </div>

      <DataTable
        columns={buildColumns(locale)}
        rows={rows}
        rowKey={(row) => row.id}
        ariaLabel="Row counts from the most recent import"
        mobileCards
      />
    </section>
  )
}
