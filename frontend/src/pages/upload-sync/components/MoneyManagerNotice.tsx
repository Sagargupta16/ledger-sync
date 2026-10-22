import { motion } from 'motion/react'
import { CheckCircle2, RefreshCw } from 'lucide-react'

import { Button, Card } from '@/components/ui'

import type { BackupNotice } from '../useMoneyManagerImport'

interface MoneyManagerNoticeProps {
  readonly notice: BackupNotice | null
  readonly isBusy: boolean
  readonly onForceReimport: () => Promise<void>
  readonly onRetry: () => Promise<void>
}

export default function MoneyManagerNotice({
  notice,
  isBusy,
  onForceReimport,
  onRetry,
}: MoneyManagerNoticeProps) {
  if (!notice) return null

  if (notice.kind === 'up-to-date') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-4 rounded-lg border border-app-green/30 bg-app-green/10 p-4"
      >
        <CheckCircle2 className="size-5 shrink-0 text-app-green" aria-hidden="true" />
        <div className="min-w-48 flex-1">
          <h3 className="font-semibold text-foreground">Already up to date</h3>
          <p className="break-words text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{notice.fileName}</span> was already
            imported, so nothing changed.
            {!notice.forced && ' Re-importing shows the review again before anything is saved.'}
          </p>
        </div>
        {!notice.forced && (
          <Button
            variant="secondary"
            icon={<RefreshCw className="size-4" />}
            isLoading={isBusy}
            onClick={() => void onForceReimport()}
          >
            Re-import anyway
          </Button>
        )}
      </motion.div>
    )
  }

  return (
    <Card className="border-error/30">
      <div role="alert" className="space-y-3">
        <h3 className="font-semibold text-foreground">
          {notice.retry ? 'Import needs attention' : 'Backup needs attention'}
        </h3>
        <p className="break-words text-sm leading-6 text-muted-foreground">
          {notice.fileName}: {notice.message}
        </p>
        {notice.retry ? (
          <Button variant="secondary" onClick={() => void onRetry()} isLoading={isBusy}>
            Retry import
          </Button>
        ) : (
          <p className="text-sm text-foreground">
            No ledger entries were changed. Select a backup to try again.
          </p>
        )}
      </div>
    </Card>
  )
}
