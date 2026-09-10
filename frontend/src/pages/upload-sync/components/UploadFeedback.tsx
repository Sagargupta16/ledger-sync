import { motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

import { Button, Card } from '@/components/ui'

import type { UploadConflict, UploadFailure, UploadSuccess } from '../useUploadSync'

interface UploadFeedbackProps {
  readonly conflict: UploadConflict | null
  readonly failure: UploadFailure | null
  readonly success: UploadSuccess | null
  readonly isBusy: boolean
  readonly onForceReupload: () => void
  readonly onRetryUpload: () => Promise<void>
  readonly onRetryAnalytics: () => Promise<void>
}

export default function UploadFeedback({
  conflict,
  failure,
  success,
  isBusy,
  onForceReupload,
  onRetryUpload,
  onRetryAnalytics,
}: UploadFeedbackProps) {
  return (
    <>
      {success && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-lg border border-app-green/30 bg-app-green/10 p-4"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-app-green" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Import complete</h3>
            <p className="mt-0.5 break-words text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{success.fileName}</span>
              {': '}
              {success.summary}
            </p>
            {success.analyticsStatus === 'ready' ? (
              <p className="mt-2 text-sm text-foreground">Insights are up to date.</p>
            ) : (
              <div className="mt-3 space-y-2 border-t border-app-yellow/30 pt-3">
                <p className="text-sm text-warning-text">
                  {success.analyticsMessage ?? (
                    success.analyticsStatus === 'failed'
                      ? 'Your ledger is saved, but insights could not be refreshed.'
                      : 'Your ledger is saved. The server did not confirm the insights refresh.'
                  )}
                </p>
                <Button
                  variant="secondary"
                  icon={<RefreshCw className="size-4" />}
                  isLoading={isBusy}
                  onClick={() => void onRetryAnalytics()}
                >
                  Retry insights refresh
                </Button>
                <p className="text-xs text-muted-foreground">This will not re-import your file.</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {conflict && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-lg border border-app-yellow/30 bg-app-yellow/10 p-5"
        >
          <div className="rounded-md bg-app-yellow/20 p-3">
            <AlertTriangle className="size-6 text-warning-text" aria-hidden="true" />
          </div>
          <div className="min-w-48 flex-1">
            <h3 className="font-semibold text-warning-text">File already imported</h3>
            <p className="text-pretty text-sm text-muted-foreground">
              <span className="font-mono text-sm text-foreground">
                {conflict.parsed.fileName}
              </span>{' '}
              was imported before. Review the full-snapshot scope before syncing it again.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            icon={<RefreshCw className="size-4" />}
            isLoading={isBusy}
            onClick={() => onForceReupload()}
            className="border-app-yellow bg-app-yellow text-on-warning hover:bg-app-yellow/90"
          >
            Sync changes
          </Button>
        </motion.div>
      )}

      {failure && (
        <Card className="border-error/30">
          <div role="alert" className="space-y-3">
            <h3 className="font-semibold text-foreground">
              {failure.parsed ? 'Upload needs attention' : 'File needs attention'}
            </h3>
            <p className="break-words text-sm leading-6 text-muted-foreground">
              {failure.fileName}: {failure.message}
            </p>
            {failure.parsed ? (
              <Button
                variant="secondary"
                onClick={() => void onRetryUpload()}
                isLoading={isBusy}
              >
                Retry upload
              </Button>
            ) : (
              <p className="text-sm text-foreground">
                No ledger entries were changed. Correct the file and select it again.
              </p>
            )}
          </div>
        </Card>
      )}
    </>
  )
}
