import { apiClient } from './client'

/** What the server read from the backup. Dates are `YYYY-MM-DD`, null when there are none. */
export interface MoneyManagerBackupSummary {
  transactions: number
  transfers: number
  accounts: number
  first_date: string | null
  last_date: string | null
}

export interface MoneyManagerImportStats {
  processed: number
  inserted: number
  updated: number
  deleted: number
  unchanged: number
}

/**
 * `preview` is a dry run that saved nothing, with the stats it would commit.
 * `unchanged` means this exact backup was already imported.
 */
export interface MoneyManagerImportResponse {
  status: 'imported' | 'unchanged' | 'preview'
  file_name: string
  stats: MoneyManagerImportStats
  summary: MoneyManagerBackupSummary
  analytics_status: 'ready' | 'failed' | 'skipped'
  analytics_message: string | null
}

export interface MoneyManagerImportParams {
  fileName: string
  /** The gzip of the `.mmbak` bytes, from `gzipBackup`. */
  backup: Blob
  dryRun: boolean
  force: boolean
  allowLargeDelete: boolean
}

// The server parses the SQLite backup and rebuilds insights in the same request.
const IMPORT_TIMEOUT_MS = 120_000
// Vercel rejects a larger request body before the API runs, so the API's own
// 413 explanation would never reach the browser.
const MAX_BODY_BYTES = 4_500_000

/** Gzip with the browser's native stream: a 4.96 MB backup posts as 1.32 MB. */
export async function gzipBackup(file: Blob): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('This browser cannot compress the backup. Update your browser and try again.')
  }
  return new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob()
}

export const moneyManagerBackupService = {
  importBackup: async ({
    fileName,
    backup,
    dryRun,
    force,
    allowLargeDelete,
  }: MoneyManagerImportParams): Promise<MoneyManagerImportResponse> => {
    if (backup.size > MAX_BODY_BYTES) {
      throw new Error('This backup is over 4.5 MB even after compression, more than the server accepts.')
    }
    const response = await apiClient.post<MoneyManagerImportResponse>('/api/upload/money-manager', backup, {
      params: {
        file_name: fileName,
        dry_run: dryRun,
        force,
        allow_large_delete: allowLargeDelete,
      },
      headers: { 'Content-Type': 'application/gzip' },
      timeout: IMPORT_TIMEOUT_MS,
    })
    return response.data
  },
}
