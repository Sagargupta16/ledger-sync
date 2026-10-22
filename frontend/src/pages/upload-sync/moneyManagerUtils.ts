import { isAxiosError } from 'axios'

import { getApiErrorMessage } from '@/lib/errorUtils'
import { getActiveLocale } from '@/lib/formatters'
import type {
  MoneyManagerImportResponse,
  MoneyManagerImportStats,
} from '@/services/api/moneyManagerBackup'

import type { UploadSuccess } from './useUploadSync'

export const MONEY_MANAGER_EXTENSION = '.mmbak'

/** Backups are parsed on the server; spreadsheets are parsed in the browser. */
export const isMoneyManagerBackup = (file: File) =>
  file.name.toLowerCase().endsWith(MONEY_MANAGER_EXTENSION)

/** Counts group like every other number in the active display locale. */
export const formatCount = (value: number) => value.toLocaleString(getActiveLocale())

export function describeBackupChanges({
  inserted,
  updated,
  deleted,
  unchanged,
}: MoneyManagerImportStats): string {
  const parts = [`${formatCount(inserted)} added`]
  if (updated > 0) parts.push(`${formatCount(updated)} updated`)
  if (deleted > 0) parts.push(`${formatCount(deleted)} removed`)
  if (unchanged > 0) parts.push(`${formatCount(unchanged)} unchanged`)
  return `${parts.join(', ')}.`
}

/** A skipped refresh is only current when the import changed nothing. */
export function toUploadAnalyticsStatus({
  analytics_status: status,
  stats,
}: MoneyManagerImportResponse): UploadSuccess['analyticsStatus'] {
  if (status !== 'skipped') return status
  return stats.inserted + stats.updated + stats.deleted === 0 ? 'ready' : 'unknown'
}

/** A dry run never saves, so only a timed-out import may have landed anyway. */
export function getBackupErrorMessage(error: unknown, saving: boolean): string {
  const axiosError = isAxiosError(error) ? error : null
  if (axiosError?.code === 'ECONNABORTED' || axiosError?.response?.status === 504) {
    return saving
      ? 'The request timed out. Check import history before retrying; the server may have saved your ledger.'
      : 'The request timed out before the backup was checked. Nothing was saved; try again.'
  }
  if (axiosError?.code === 'ERR_NETWORK') {
    return 'Could not reach the server. Check your internet connection and try again.'
  }
  return getApiErrorMessage(error, 'The backup could not be imported.')
}
