import { useDropzone } from 'react-dropzone'

import { FileText } from 'lucide-react'

import { cn } from '@/lib/cn'
import { MAX_CAS_BYTES } from '@/services/api/cas'

interface CasFileFieldProps {
  readonly file: File | null
  readonly disabled: boolean
  readonly onFile: (file: File | null) => void
  readonly onError: (message: string | null) => void
}

/** Drop zone for one CAS PDF; it reports a refused file through `onError`. */
export function CasFileField({ file, disabled, onFile, onError }: CasFileFieldProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: MAX_CAS_BYTES,
    disabled,
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) {
        const tooLarge = rejected.some((r) => r.errors.some((e) => e.code === 'file-too-large'))
        onError(tooLarge ? 'This PDF is over 4.4 MB, more than the server accepts.' : 'Choose one CAS PDF.')
        return
      }
      onError(null)
      onFile(accepted[0] ?? null)
    },
  })

  let label = 'Choose or drop the CAS PDF'
  if (file) label = file.name
  else if (isDragActive) label = 'Drop the PDF here'

  return (
    <div
      {...getRootProps({ role: 'button', 'aria-label': `CAS PDF: ${label}` })}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-2.5 text-sm transition-colors duration-150',
        'hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        file || isDragActive ? 'border-primary text-foreground' : 'border-[var(--hairline-5)] text-muted-foreground',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input {...getInputProps()} />
      <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}
