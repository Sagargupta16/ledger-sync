import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  isUploading?: boolean
  compact?: boolean
}

export default function DropZone({ onFileSelect, isUploading, compact }: DropZoneProps) {
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

  const clearFile = () => {
    setSelectedFile(null)
  }

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 glass',
          'hover:border-primary hover:bg-primary/10 hover:shadow-xl hover:shadow-primary/20',
          isDragActive && 'border-primary bg-primary/20 scale-[1.02] shadow-xl shadow-primary/30',
          isUploading && 'opacity-50 cursor-not-allowed',
          selectedFile ? 'border-primary bg-primary/10' : 'border-border/50',
          compact ? 'p-4' : 'p-12 rounded-2xl hover:shadow-2xl'
        )}
      >
        <input {...getInputProps()} />
        
        <div className={cn('flex items-center gap-3', !compact && 'flex-col gap-4')}>
          <div className={cn(
            'rounded-full transition-all duration-300',
            selectedFile || isDragActive ? 'bg-primary/20 shadow-lg shadow-primary/30' : 'bg-primary/10',
            compact ? 'p-2' : 'p-4'
          )}>
            {selectedFile ? (
              <FileSpreadsheet className={cn('text-primary', compact ? 'w-6 h-6' : 'w-12 h-12 animate-pulse')} />
            ) : (
              <Upload className={cn('text-primary transition-transform', isDragActive && 'scale-110', compact ? 'w-6 h-6' : 'w-12 h-12')} />
            )}
          </div>
          </div>

          {selectedFile ? (
            <div className={compact ? 'flex-1 text-left' : 'space-y-2'}>
              <div className={cn(
                'flex items-center gap-2 glass-strong rounded-lg border border-white/20',
                compact ? 'px-2 py-1' : 'px-4 py-2 shadow-lg'
              )}>
                <FileSpreadsheet className={cn('text-primary', compact ? 'w-4 h-4' : 'w-5 h-5')} />
                <span className={cn('font-medium truncate', compact ? 'text-xs max-w-[120px]' : '')}>{selectedFile.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    clearFile()
                  }}
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
          ) : (
            <div className={compact ? 'flex-1 text-left' : ''}>
              <div className={compact ? '' : 'space-y-2'}>
                <h3 className={cn('font-semibold', compact ? 'text-sm' : 'text-xl')}>
                  {isDragActive ? 'Drop here' : compact ? 'Upload Excel' : 'Upload Excel File'}
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
          )}
        </div>

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center glass-strong rounded-2xl">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full shadow-lg shadow-primary/50" />
              <p className="text-sm font-medium">Uploading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
