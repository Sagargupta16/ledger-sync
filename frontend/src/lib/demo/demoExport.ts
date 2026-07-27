import type { Transaction } from '@/types'

import { filterDemoTransactions } from './demoTxFilters'

/**
 * Column order of `GET /api/transactions/export`
 * (`backend/api/transactions.py::export_transactions`). Kept as one constant so
 * a column added server-side is a one-line change here.
 */
export const DEMO_EXPORT_COLUMNS = [
  'id',
  'date',
  'amount',
  'currency',
  'type',
  'category',
  'subcategory',
  'account',
  'from_account',
  'to_account',
  'note',
  'source_file',
  'last_seen_at',
  'tags',
] as const

/** Stand-in for the workbook a real import would have come from. */
const DEMO_SOURCE_FILE = 'demo_ledger.xlsx'

/**
 * Quote the way Python's `csv.writer` does at its QUOTE_MINIMAL default: only
 * when the field carries a delimiter, a quote, or a newline, and an embedded
 * quote is doubled. Matching it means the demo file opens in the same tools
 * with the same column count as a real export.
 */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function csvRow(fields: readonly string[]): string {
  return fields.map(csvField).join(',')
}

/**
 * Mirrors the CSV body of `/api/transactions/export`.
 *
 * Without a demo route this GET fell through to the adapter's `[]` catch-all, so
 * `exportToCSV()` resolved an array where the page expected a `Blob`;
 * `URL.createObjectURL` then threw and the visitor got an "Export failed" toast
 * for a button that should just work.
 *
 * `last_seen_at` and `source_file` are absent on generated demo rows, so they
 * fall back to the row's own date and a synthetic file name -- the export must
 * never publish an empty column where the real one always has a value.
 */
export function generateDemoExportCsv(
  txs: Transaction[],
  params: Record<string, unknown> = {},
): string {
  const rows = filterDemoTransactions(txs, params)
  const lines = [csvRow(DEMO_EXPORT_COLUMNS)]
  for (const t of rows) {
    // The backend column is a DateTime, so `isoformat()` carries a time part.
    const dateTime = `${t.date}T00:00:00`
    lines.push(
      csvRow([
        t.id,
        dateTime,
        String(t.amount),
        t.currency ?? 'INR',
        t.type,
        t.category,
        t.subcategory ?? '',
        t.account,
        t.from_account ?? '',
        t.to_account ?? '',
        t.note ?? '',
        t.source_file ?? DEMO_SOURCE_FILE,
        t.last_seen_at ?? dateTime,
        // The backend writes `json.dumps(tags)`, so an untagged row carries
        // "[]" rather than an empty cell and a reader can parse every row
        // unconditionally. Demo rows must not break that invariant.
        JSON.stringify(t.tags ?? []),
      ]),
    )
  }
  // `csv.writer` terminates every row, the header included, with CRLF.
  return `${lines.join('\r\n')}\r\n`
}

/** What the axios demo adapter hands back for `responseType: 'blob'`. */
export function generateDemoExportBlob(
  txs: Transaction[],
  params: Record<string, unknown> = {},
): Blob {
  return new Blob([generateDemoExportCsv(txs, params)], { type: 'text/csv' })
}
