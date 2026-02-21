import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  isUploading?: boolean
  compact?: boolean
}

// --- Sub-component prop types ---

interface IconBubbleProps {
  selectedFile: File | null
  isDragActive: boolean
  compact?: boolean
}

interface FileSelectedViewProps {
  selectedFile: File
  compact?: boolean
  isUploading?: boolean
  onClear: (e: React.MouseEvent) => void
}

interface EmptyStateViewProps {
  isDragActive: boolean
  compact?: boolean
}

interface UploadingOverlayProps {
  isUploading?: boolean
}

// --- Helper function for heading text (fixes Issue 2: nested ternary) ---

function getHeadingText(isDragActive: boolean, compact?: boolean): string {
  if (isDragActive) {
    return 'Drop here'
  }
  if (compact) {
    return 'Upload Excel'
  }
  return 'Upload Excel File'
}

// --- Sub-components (fixes Issue 1: cognitive complexity) ---

function IconBubble({ selectedFile, isDragActive, compact }: Readonly<IconBubbleProps>) {
  const hasHighlight = selectedFile || isDragActive

  return (
    <div className={cn(
      'rounded-full transition-colors duration-300',
      hasHighlight ? 'bg-primary/20 shadow-lg shadow-primary/30' : 'bg-primary/10',
      compact ? 'p-2' : 'p-4'
    )}>
      {selectedFile ? (
        <FileSpreadsheet className={cn('text-primary', compact ? 'w-6 h-6' : 'w-12 h-12 animate-pulse')} />
      ) : (
        <Upload className={cn('text-primary transition-transform', isDragActive && 'scale-110', compact ? 'w-6 h-6' : 'w-12 h-12')} />
      )}
    </div>
  )
}

function FileSelectedView({ selectedFile, compact, isUploading, onClear }: Readonly<FileSelectedViewProps>) {
  return (
    <div className={compact ? 'flex-1 text-left' : 'space-y-2'}>
      <div className={cn(
        'flex items-center gap-2 glass-strong rounded-lg border border-border-strong',
        compact ? 'px-2 py-1' : 'px-4 py-2 shadow-lg'
      )}>
        <FileSpreadsheet className={cn('text-primary', compact ? 'w-4 h-4' : 'w-5 h-5')} />
        <span className={cn('font-medium truncate', compact ? 'text-xs max-w-[120px]' : '')}>{selectedFile.name}</span>
        <button
          onClick={onClear}
          className="ml-auto p-1 hover:bg-destructive/20 rounded-full transition-colors"
          disabled={isUploading}
        >
          <X className={cn('text-destructive', compact ? 'w-3 h-3' : 'w-4 h-4')} />
        </button>
      </div>
      {!compact && (
        <p className="text-sm text-muted-foreground">
          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
        </p>
      )}
    </div>
  )
}

function EmptyStateView({ isDragActive, compact }: Readonly<EmptyStateViewProps>) {
  return (
    <div className={compact ? 'flex-1 text-left' : ''}>
      <div className={compact ? '' : 'space-y-2'}>
        <h3 className={cn('font-semibold', compact ? 'text-sm' : 'text-xl')}>
          {getHeadingText(isDragActive, compact)}
        </h3>
        {!compact && (
          <p className="text-sm text-muted-foreground">
            Drag and drop your Excel file here, or click to browse
          </p>
        )}
      </div>

      {!compact && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
          <FileSpreadsheet className="w-4 h-4" />
          <span>Supports .xlsx and .xls files</span>
        </div>
      )}
    </div>
  )
}

function UploadingOverlay({ isUploading }: Readonly<UploadingOverlayProps>) {
  if (!isUploading) {
    return null
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center glass-strong rounded-2xl">
      <div className="flex flex-col items-center gap-2">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full shadow-lg shadow-primary/50" />
        <p className="text-sm font-medium">Uploading...</p>
      </div>
    </div>
  )
}

// --- Main component ---

export default function DropZone({ onFileSelect, isUploading, compact }: Readonly<DropZoneProps>) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0]
        setSelectedFile(file)
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: isUploading,
  })

  const handleClearFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedFile(null)
  }

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors duration-300 glass',
          'hover:border-primary hover:bg-primary/10 hover:shadow-xl hover:shadow-primary/20',
          isDragActive && 'border-primary bg-primary/20 scale-[1.02] shadow-xl shadow-primary/30',
          isUploading && 'opacity-50 cursor-not-allowed',
          selectedFile ? 'border-primary bg-primary/10' : 'border-border/50',
          compact ? 'p-4' : 'p-12 rounded-2xl hover:shadow-2xl'
        )}
      >
        <input {...getInputProps()} />

        <div className={cn('flex items-center gap-3', !compact && 'flex-col gap-4')}>
          <IconBubble selectedFile={selectedFile} isDragActive={isDragActive} compact={compact} />

          {selectedFile ? (
            <FileSelectedView
              selectedFile={selectedFile}
              compact={compact}
              isUploading={isUploading}
              onClear={handleClearFile}
            />
          ) : (
            <EmptyStateView isDragActive={isDragActive} compact={compact} />
          )}
        </div>

        <UploadingOverlay isUploading={isUploading} />
      </div>
    </div>
  )
}
