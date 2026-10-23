import type { MoneyManagerImportResponse } from '@/services/api/moneyManagerBackup'

export const BACKUP_NAME = '20261020_062652.mmbak'
export const BACKUP = new File(['SQLite format 3'], BACKUP_NAME)
/** Stands in for the gzip `gzipBackup` would produce. */
export const GZIPPED = new Blob(['gzip bytes'])

/** The server's dry run of that backup: what an import would change. */
export const PREVIEW: MoneyManagerImportResponse = {
  status: 'preview',
  file_name: BACKUP_NAME,
  stats: { processed: 8728, inserted: 31, updated: 4, deleted: 2, unchanged: 8691 },
  summary: {
    transactions: 8216, transfers: 512, accounts: 23,
    first_date: '2019-04-01', last_date: '2026-10-20',
  },
  analytics_status: 'skipped',
  analytics_message: null,
}

export const IMPORTED: MoneyManagerImportResponse = {
  ...PREVIEW,
  status: 'imported',
  analytics_status: 'ready',
}

export const CHANGE_SUMMARY = '31 added, 4 updated, 2 removed, 8,691 unchanged.'
