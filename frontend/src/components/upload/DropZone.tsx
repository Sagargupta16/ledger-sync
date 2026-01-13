import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  isUploading?: boolean
}

export default function DropZone({ onFileSelect, isUploading }: DropZoneProps) {
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
          'relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 glass',
          'hover:border-primary hover:bg-primary/10 hover:shadow-2xl hover:shadow-primary/20',
          isDragActive && 'border-primary bg-primary/20 scale-[1.02] shadow-2xl shadow-primary/30',
          isUploading && 'opacity-50 cursor-not-allowed',
          selectedFile ? 'border-primary bg-primary/10' : 'border-border/50'
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center gap-4">
          <div className={cn(
            'p-4 rounded-full transition-all duration-300',
            selectedFile || isDragActive ? 'bg-primary/20 shadow-lg shadow-primary/30' : 'bg-primary/10'
          )}>
            {selectedFile ? (
              <FileSpreadsheet className="w-12 h-12 text-primary animate-pulse" />
            ) : (
              <Upload className={cn('w-12 h-12 text-primary transition-transform', isDragActive && 'scale-110')} />
            )}
          </div>

          {selectedFile ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-4 py-2 glass-strong rounded-lg border border-white/20 shadow-lg">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <span className="font-medium">{selectedFile.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    clearFile()
                  }}
                  className="ml-2 p-1 hover:bg-destructive/20 rounded-full transition-colors"
                  disabled={isUploading}
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">
                  {isDragActive ? 'Drop your file here' : 'Upload Excel File'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Drag and drop your Excel file here, or click to browse
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Supports .xlsx and .xls files</span>
              </div>
            </>
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
