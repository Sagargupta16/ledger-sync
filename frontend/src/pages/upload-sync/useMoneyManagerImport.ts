import { useState, type RefObject } from 'react'

import { toast } from 'sonner'

import { useMoneyManagerUpload } from '@/hooks/api/useMoneyManagerUpload'
import { getSessionSignal, isCurrentSession } from '@/lib/session'
import { gzipBackup, type MoneyManagerImportResponse } from '@/services/api/moneyManagerBackup'

import {
  describeBackupChanges,
  getBackupErrorMessage,
  toUploadAnalyticsStatus,
} from './moneyManagerUtils'
import type { UploadPhase, UploadSuccess } from './useUploadSync'

/** A compressed backup and the dry run the server ran on exactly those bytes. */
export interface BackupReview {
  readonly fileName: string
  readonly backup: Blob
  readonly preview: MoneyManagerImportResponse
  readonly force: boolean
}

export type BackupNotice =
  | {
      readonly kind: 'up-to-date'
      readonly fileName: string
      readonly backup: Blob
      readonly forced: boolean
    }
  | {
      readonly kind: 'failed'
      readonly fileName: string
      readonly message: string
      /** Set when the import itself failed; a failed dry run is fixed by choosing a file again. */
      readonly retry: BackupReview | null
    }

/** State the backup flow shares with the spreadsheet flow in `useUploadSync`. */
interface SharedUploadState {
  readonly busyRef: RefObject<boolean>
  readonly setPhase: (phase: UploadPhase) => void
  readonly setSelectedFileName: (fileName: string | null) => void
  readonly setSuccess: (success: UploadSuccess | null) => void
}

const reuse = (backup: Blob) => () => Promise.resolve(backup)

/**
 * The `.mmbak` flow. The browser only gzips the backup; the server parses it.
 * A dry run fills the review, and confirming posts the same compressed bytes,
 * so what is saved is what was reviewed even if the file changes on disk.
 */
export function useMoneyManagerImport({
  busyRef,
  setPhase,
  setSelectedFileName,
  setSuccess,
}: SharedUploadState) {
  const [review, setReview] = useState<BackupReview | null>(null)
  const [notice, setNotice] = useState<BackupNotice | null>(null)
  const importMutation = useMoneyManagerUpload()

  const settle = () => {
    setPhase(null)
    setSelectedFileName(null)
  }

  const publish = (
    result: MoneyManagerImportResponse,
    fileName: string,
    backup: Blob,
    force: boolean,
  ) => {
    if (result.status === 'preview') {
      setReview({ fileName, backup, preview: result, force })
      setPhase('review')
      return
    }
    settle()
    if (result.status === 'unchanged') {
      setNotice({ kind: 'up-to-date', fileName, backup, forced: force })
      toast.info('Already up to date', {
        description: 'This backup was already imported. Nothing changed.',
        duration: 5000,
      })
      return
    }
    const summary = describeBackupChanges(result.stats)
    setSuccess({
      fileName,
      summary,
      analyticsStatus: toUploadAnalyticsStatus(result),
      analyticsMessage: result.analytics_message,
    })
    toast.success('Ledger saved', { description: summary, duration: 5000 })
  }

  /**
   * One request at a time: a dry run when `pending` is null, otherwise the
   * import of that review. A result from an older session is not published.
   */
  const send = async (
    fileName: string,
    force: boolean,
    readBackup: () => Promise<Blob>,
    pending: BackupReview | null,
  ) => {
    if (busyRef.current) return
    const sessionSignal = getSessionSignal()
    busyRef.current = true
    setReview(null)
    setNotice(null)
    setSelectedFileName(fileName)
    setPhase(pending ? 'processing' : 'previewing')

    try {
      const backup = await readBackup()
      // Both requests allow a large removal: the dry run commits nothing and
      // the review lists its removals, which the user confirms before saving.
      const result = await importMutation.mutateAsync({
        fileName,
        backup,
        dryRun: !pending,
        force,
        allowLargeDelete: true,
      })
      if (isCurrentSession(sessionSignal)) publish(result, fileName, backup, force)
      else settle()
    } catch (error) {
      settle()
      if (!isCurrentSession(sessionSignal)) return
      const message = getBackupErrorMessage(error, pending !== null)
      setNotice({ kind: 'failed', fileName, message, retry: pending })
      toast.error(pending ? 'Import Failed' : 'Backup Check Failed', {
        description: message,
        duration: 6000,
      })
    } finally {
      busyRef.current = false
    }
  }

  const save = (pending: BackupReview) =>
    send(pending.fileName, pending.force, reuse(pending.backup), pending)

  return {
    review,
    notice,
    selectBackup: (file: File) => send(file.name, false, () => gzipBackup(file), null),
    forceReimport: async () => {
      if (notice?.kind === 'up-to-date') await send(notice.fileName, true, reuse(notice.backup), null)
    },
    confirm: async () => {
      if (review) await save(review)
    },
    retry: async () => {
      if (notice?.kind === 'failed' && notice.retry) await save(notice.retry)
    },
    cancel: () => {
      setReview(null)
      settle()
    },
    clear: () => {
      setReview(null)
      setNotice(null)
    },
  }
}
