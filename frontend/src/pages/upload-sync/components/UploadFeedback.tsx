import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import ErrorState from '@/components/shared/ErrorState'
import { Button } from '@/components/ui'

import type { UploadConflict, UploadFailure } from '../useUploadSync'

interface UploadFeedbackProps {
  readonly conflict: UploadConflict | null
  readonly failure: UploadFailure | null
  readonly isBusy: boolean
  readonly onForceReupload: () => Promise<void>
  readonly onRetryUpload: () => Promise<void>
}

export default function UploadFeedback({
  conflict,
  failure,
  isBusy,
  onForceReupload,
  onRetryUpload,
}: UploadFeedbackProps) {
  return (
    <>
      {conflict && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-lg border border-app-yellow/30 bg-app-yellow/10 p-5"
        >
          <div className="rounded-full bg-app-yellow/20 p-3">
            <AlertTriangle className="size-6 text-warning-text" aria-hidden="true" />
          </div>
          <div className="min-w-48 flex-1">
            <h3 className="font-semibold text-warning-text">File Already Uploaded</h3>
            <p className="text-pretty text-sm text-muted-foreground">
              <span className="font-mono text-sm text-foreground">
                {conflict.parsed.fileName}
              </span>{' '}
              was imported before. Re-upload to sync changes.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            icon={<RefreshCw className="size-4" />}
            isLoading={isBusy}
            onClick={() => void onForceReupload()}
            className="border-app-yellow bg-app-yellow text-on-warning hover:bg-app-yellow/90"
          >
            Force Reupload
          </Button>
        </motion.div>
      )}

      {failure && (
        <ErrorState
          variant="card"
          title="Upload failed"
          message={`${failure.parsed.fileName}: ${failure.message}`}
          onRetry={() => void onRetryUpload()}
        />
      )}
    </>
  )
}
