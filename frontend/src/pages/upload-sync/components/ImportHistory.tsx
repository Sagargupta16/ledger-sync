/**
 * Past imports for the signed-in user.
 *
 * `import_logs` has been written on every upload since the first release -- it
 * is the file-hash idempotency record -- but nothing ever displayed it, so
 * "did my last import actually land, and what did it change?" was only
 * answerable from the database. This renders the series the backend already had.
 */

import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'

import { DataTable, type DataTableColumn } from '@/components/ui'
import EmptyState from '@/components/shared/EmptyState'
import Spinner from '@/components/ui/Spinner'
import { isDemoMode } from '@/store/demoStore'
import { uploadService, type ImportHistoryEntry } from '@/services/api/upload'

const HISTORY_LIMIT = 10

/**
 * `imported_at` arrives as a UTC ISO-8601 string, so `new Date` parses the
 * offset correctly and `toLocaleString` renders it in the viewer's zone.
 * `formatDate` from `lib/formatters` is not used here: it matches
 * `YYYY-MM-DD` only and returns a timestamp unchanged.
 */
function formatImportedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const columns: DataTableColumn<ImportHistoryEntry>[] = [
  {
    key: 'imported_at',
    header: 'Imported',
    cell: (row) => formatImportedAt(row.imported_at),
    sortValue: (row) => row.imported_at,
    mobilePrimary: true,
  },
  {
    key: 'file_name',
    header: 'File',
    cell: (row) => row.file_name,
    sortValue: (row) => row.file_name,
  },
  {
    key: 'rows_processed',
    header: 'Processed',
    cell: (row) => row.rows_processed.toLocaleString('en-IN'),
    sortValue: (row) => row.rows_processed,
    align: 'right',
  },
  {
    key: 'rows_inserted',
    header: 'New',
    cell: (row) => row.rows_inserted.toLocaleString('en-IN'),
    sortValue: (row) => row.rows_inserted,
    align: 'right',
  },
  {
    key: 'rows_updated',
    header: 'Updated',
    cell: (row) => row.rows_updated.toLocaleString('en-IN'),
    sortValue: (row) => row.rows_updated,
    align: 'right',
  },
  {
    key: 'rows_skipped',
    header: 'Already present',
    cell: (row) => row.rows_skipped.toLocaleString('en-IN'),
    sortValue: (row) => row.rows_skipped,
    align: 'right',
  },
]

export default function ImportHistory() {
  // Demo mode has no server-side import log and its mutations are blocked, so
  // the request is not made rather than showing a failed panel.
  const demo = isDemoMode()

  const query = useQuery({
    queryKey: ['import-history', HISTORY_LIMIT],
    queryFn: () => uploadService.getImportHistory(HISTORY_LIMIT),
    enabled: !demo,
    staleTime: Infinity,
  })

  if (demo) return null

  const imports = query.data?.imports ?? []
  const total = query.data?.total_count ?? 0

  return (
    <section className="ledger-panel p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-app-teal/10">
            <History className="size-3.5 text-app-teal" />
          </span>
          <span>Import history</span>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {total > imports.length
            ? `Showing the ${imports.length} most recent of ${total} imports.`
            : 'Every import recorded for this account.'}
        </p>
      </div>

      {query.isLoading && <Spinner />}

      {query.isError && (
        <p className="text-sm text-muted-foreground">
          Could not load import history.{' '}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-primary hover:underline"
          >
            Try again
          </button>
        </p>
      )}

      {!query.isLoading && !query.isError && (
        imports.length > 0 ? (
          <DataTable
            columns={columns}
            rows={imports}
            rowKey={(row) => String(row.id)}
            initialSort={{ key: 'imported_at', dir: 'desc' }}
            ariaLabel="Import history"
            mobileCards
          />
        ) : (
          <EmptyState
            icon={History}
            title="No imports yet"
            description="Once you import a statement, each run is recorded here with its row counts."
            variant="compact"
          />
        )
      )}
    </section>
  )
}
