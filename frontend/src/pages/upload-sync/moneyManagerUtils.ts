import { isAxiosError } from 'axios'

import { getApiErrorMessage } from '@/lib/errorUtils'
import { getActiveLocale } from '@/lib/formatters'
import type {
  BackupPlanning,
  BackupPlanningCounts,
  MoneyManagerImportResponse,
  MoneyManagerImportStats,
} from '@/services/api/moneyManagerBackup'

import type { UploadSuccess } from './useUploadSync'

export const MONEY_MANAGER_EXTENSION = '.mmbak'

/** The name the Handbook gives the iOS Shortcut that uploads the newest backup. */
export const MONEY_MANAGER_SHORTCUT_NAME = 'Ledger Sync Backup'

export const moneyManagerShortcutUrl = (name = MONEY_MANAGER_SHORTCUT_NAME) =>
  `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`

/** iPhone, iPod and iPad; iPadOS reports a Mac user agent, so touch points tell it apart. */
export const isAppleMobile = ({ userAgent, maxTouchPoints }: Navigator = navigator) =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)

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

/** Why the server skipped an item; each reads after a count ("39 yearly ..."). */
export const SKIP_REASON_LABELS: Readonly<Record<string, string>> = {
  unknown_type: 'with a repeat type not recognised',
  transfer: 'between your own accounts (transfers are not scheduled yet)',
  not_inr: 'not in INR',
  ended: 'already ended',
  incomplete: 'missing an account, date or amount',
  invalid: 'with a name or note Ledger Sync cannot store',
  yearly: 'yearly (budgets here are monthly)',
  subcategory: 'on a subcategory (tracked per category for now)',
  unsupported: 'on an account, the total or an unknown type',
  missing_category: 'on a category deleted in Money Manager',
  no_amount: 'without a usable amount for this month',
  conflict: 'on a category that already has a budget',
}

/** The response's `planning` field; a server that predates it sends none. */
export function getBackupPlanning(result: MoneyManagerImportResponse): BackupPlanning | null {
  return result.planning ?? null
}

export const countSkipped = ({ skipped }: BackupPlanningCounts) =>
  Object.values(skipped).reduce((total, count) => total + count, 0)

/**
 * One sentence per kind that changed, e.g. "Repeat rules: 11 added." Skips are
 * left to the review, so an import that changed neither kind adds nothing.
 */
export function describePlanningChanges(planning: BackupPlanning | null): string {
  if (!planning) return ''
  const kinds = [
    ['Repeat rules', planning.repeat_rules],
    ['Budgets', planning.budgets],
  ] as const
  return kinds
    .flatMap(([label, counts]) => {
      if (!counts) return []
      const parts = [
        [counts.added, 'added'],
        [counts.updated, 'updated'],
        [counts.removed, 'turned off'],
      ] as const
      const changed = parts.filter(([count]) => count > 0)
      if (changed.length === 0) return []
      return [`${label}: ${changed.map(([count, what]) => `${formatCount(count)} ${what}`).join(', ')}.`]
    })
    .join(' ')
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
