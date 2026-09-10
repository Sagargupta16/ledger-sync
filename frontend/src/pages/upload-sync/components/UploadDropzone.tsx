import { useState } from 'react'
import { useDropzone } from 'react-dropzone'

import { motion } from 'motion/react'
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Upload,
} from 'lucide-react'

import { Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'
import { MAX_UPLOAD_SIZE_BYTES } from '@/lib/fileParser'

import type { UploadPhase } from '../useUploadSync'

const PHASE_LABELS: Record<NonNullable<UploadPhase>, string> = {
  parsing: 'Parsing file...',
  review: 'Ready for review. Nothing has been uploaded.',
  processing: 'Saving your ledger and refreshing insights...',
  analytics: 'Retrying insights refresh...',
}

const PROGRESS_STEPS: { phase: NonNullable<UploadPhase>; label: string }[] = [
  { phase: 'parsing', label: 'Read file' },
  { phase: 'review', label: 'Review scope' },
  { phase: 'processing', label: 'Save & refresh' },
]

const UPLOAD_FEATURES = [
  { icon: CheckCircle2, text: 'Auto-detect duplicates' },
  { icon: RefreshCw, text: 'Full snapshot' },
  { icon: FileSpreadsheet, text: '.xlsx, .xls & .csv' },
]

interface UploadDropzoneProps {
  readonly phase: UploadPhase
  readonly selectedFileName: string | null
  readonly isBusy: boolean
  readonly onFileSelect: (file: File) => Promise<void>
}

export default function UploadDropzone({
  phase,
  selectedFileName,
  isBusy,
  onFileSelect,
}: UploadDropzoneProps) {
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles, fileRejections) => {
      if (fileRejections.length > 0) {
        const tooLarge = fileRejections.some((rejection) =>
          rejection.errors.some((error) => error.code === 'file-too-large'),
        )
        const tooManyFiles = fileRejections.some((rejection) =>
          rejection.errors.some((error) => error.code === 'too-many-files'),
        )
        setRejectionMessage(
          tooLarge
            ? 'File exceeds the 50 MB limit.'
            : tooManyFiles
            ? 'Choose one statement at a time.'
            : 'Choose an .xlsx, .xls, or .csv transaction file.',
        )
        return
      }

      if (acceptedFiles.length > 0) {
        setRejectionMessage(null)
        void onFileSelect(acceptedFiles[0])
      }
    },
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    maxSize: MAX_UPLOAD_SIZE_BYTES,
    disabled: isBusy,
  })

  return (
    <motion.section
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ledger-panel"
      aria-labelledby="upload-import-title"
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col items-stretch gap-5 lg:flex-row lg:items-center lg:gap-8">
          <div className="flex-1 space-y-4">
            <h2
              id="upload-import-title"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Import a complete ledger
            </h2>
            <p className="max-w-lg text-pretty text-sm leading-6 text-muted-foreground">
              Choose your complete Excel or CSV export in INR. You will review the dates,
              accounts, and row counts before any existing entries are replaced.
            </p>

            <div className="grid gap-2 text-sm sm:grid-cols-3">
              {UPLOAD_FEATURES.map((feature) => (
                <div key={feature.text} className="flex items-center gap-2 text-foreground">
                  <feature.icon className="size-4 text-primary" aria-hidden="true" />
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full shrink-0 lg:w-96">
            <div
              {...getRootProps({
                role: 'button',
                'aria-label': 'Upload an Excel or CSV transaction file',
                'aria-busy': isBusy,
              })}
              className={cn(
                'relative cursor-pointer rounded-lg border border-dashed p-5 text-center transition-colors duration-150 md:p-7',
                'bg-[var(--overlay-2)] hover:border-primary hover:bg-primary/10',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2',
                isDragActive && 'border-primary bg-primary/20',
                isBusy && 'cursor-not-allowed opacity-50',
                selectedFileName ? 'border-primary' : 'border-[var(--hairline-5)]',
              )}
            >
              <input {...getInputProps()} />

              {isBusy && phase ? (
                <div className="flex flex-col items-center gap-4">
                  <Spinner size="lg" label={PHASE_LABELS[phase]} />
                  <p
                    className="max-w-full truncate font-mono text-sm text-muted-foreground"
                    title={selectedFileName ?? undefined}
                  >
                    {selectedFileName}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div
                    className={cn(
                      'flex size-12 items-center justify-center rounded-md border border-app-blue/15 transition-colors',
                      isDragActive ? 'bg-primary/20' : 'bg-primary/10',
                    )}
                  >
                    <Upload className="size-6 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {isDragActive ? 'Drop your file here' : 'Drop Excel or CSV file here'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-[var(--overlay-2)] px-3 py-1.5">
                    <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs text-muted-foreground">.xlsx, .xls, .csv up to 50 MB</span>
                  </div>
                </div>
              )}
            </div>
            {phase === 'review' && (
              <p role="status" className="mt-2 text-sm text-primary">{PHASE_LABELS.review}</p>
            )}
            {rejectionMessage && (
              <p
                role="alert"
                className="mt-2 flex items-center gap-2 text-left text-xs text-app-red"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                {rejectionMessage}
              </p>
            )}
          </div>
        </div>
        <ol className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4" aria-label="Import stages">
          {PROGRESS_STEPS.map((step, index) => {
            const activePhase = phase === 'analytics' ? 'processing' : phase
            const isCurrent = step.phase === activePhase
            return (
              <li
                key={step.phase}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn('text-xs leading-5', isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground')}
              >
                <span className="mr-1.5 font-mono" aria-hidden="true">{index + 1}.</span>
                {step.label}
              </li>
            )
          })}
        </ol>
      </div>
    </motion.section>
  )
}
