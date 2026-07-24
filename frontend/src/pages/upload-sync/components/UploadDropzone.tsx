import { useDropzone } from 'react-dropzone'

import { motion } from 'framer-motion'
import { CheckCircle2, FileSpreadsheet, RefreshCw, Sparkles, Upload } from 'lucide-react'

import { Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'

import type { UploadPhase } from '../useUploadSync'

const PHASE_LABELS: Record<NonNullable<UploadPhase>, string> = {
  parsing: 'Parsing file...',
  processing: 'Uploading and processing transactions...',
  analytics: 'Computing analytics...',
}

const UPLOAD_FEATURES = [
  { icon: CheckCircle2, text: 'Auto-detect duplicates' },
  { icon: RefreshCw, text: 'Smart sync' },
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
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        void onFileSelect(acceptedFiles[0])
      }
    },
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
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
              <Sparkles className="size-4" aria-hidden="true" />
              Import transactions
            </h2>
            <p className="max-w-lg text-pretty text-sm leading-6 text-muted-foreground">
              Drop one statement to detect new rows, changed entries, and duplicates before the ledger is refreshed.
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
                'aria-label': 'Upload an Excel or CSV transaction file',
                'aria-busy': isBusy,
              })}
              className={cn(
                'relative cursor-pointer rounded-lg border border-dashed p-5 text-center transition-colors duration-150 md:p-7',
                'bg-[var(--overlay-2)] hover:border-primary hover:bg-primary/10',
                isDragActive && 'border-primary bg-primary/20',
                isBusy && 'cursor-not-allowed opacity-50',
                selectedFileName ? 'border-primary' : 'border-[var(--hairline-5)]',
              )}
            >
              <input {...getInputProps()} />

              {isBusy && phase ? (
                <div className="flex flex-col items-center gap-4">
                  <Spinner size="lg" label={PHASE_LABELS[phase]} />
                  <p className="max-w-full truncate font-mono text-sm text-muted-foreground">
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
                    <span className="text-xs text-muted-foreground">.xlsx, .xls, .csv supported</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
