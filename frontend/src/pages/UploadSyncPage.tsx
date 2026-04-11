import { useState, useCallback } from 'react'
import { useUpload } from '@/hooks/api/useUpload'
import { motion } from 'framer-motion'
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/lib/cn'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import type { AxiosError } from 'axios'

function getUploadErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError
  if (axiosError.code === 'ECONNABORTED') {
    return 'Upload timed out. Your file may be too large or the server is busy — please try again.'
  }
  if (axiosError.code === 'ERR_NETWORK') {
    return 'Could not reach the server. Check your internet connection and try again.'
  }
  const msg = getApiErrorMessage(error)
  if (msg === 'FUNCTION_INVOCATION_TIMEOUT') {
    return 'Server took too long to process. Try uploading a smaller file or retry in a moment.'
  }
  return msg
}

// Sample data to show expected Excel format
const SAMPLE_EXCEL_DATA = [
  { date: '2024-01-15', account: 'HDFC Bank', category: 'Salary', subcategory: 'Monthly', type: 'Income', amount: 85000, note: 'Jan Salary' },
  { date: '2024-01-16', account: 'HDFC Bank', category: 'Food', subcategory: 'Groceries', type: 'Expense', amount: 3500, note: 'Big Basket' },
  { date: '2024-01-18', account: 'ICICI Card', category: 'Shopping', subcategory: 'Electronics', type: 'Expense', amount: 15999, note: 'Headphones' },
  { date: '2024-01-20', account: 'HDFC Bank', category: 'Investment', subcategory: 'Mutual Fund', type: 'Transfer-Out', amount: 10000, note: 'SIP' },
]

const TYPE_STYLES: Record<string, string> = {
  'Income': 'bg-app-green/20 text-app-green border-app-green/30',
  'Expense': 'bg-app-red/20 text-app-red border-app-red/30',
  'Transfer-Out': 'bg-app-orange/20 text-app-orange border-app-orange/30',
  'Transfer-In': 'bg-app-blue/20 text-app-blue border-app-blue/30',
}

export default function UploadSyncPage() {
  const [conflictError, setConflictError] = useState<{ file: File; message: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const uploadMutation = useUpload()
  const { guardDemoAction } = useDemoGuard()

  const onUploadProgress = useCallback((percent: number) => {
    setUploadProgress(percent)
  }, [])

  const handleFileSelect = async (file: File, force: boolean = false) => {
    if (guardDemoAction('File upload')) return
    setConflictError(null)
    setSelectedFile(file)
    setUploadProgress(0)
    try {
      const result = await uploadMutation.mutateAsync({ file, force, onUploadProgress })
      setSelectedFile(null)
      setUploadProgress(null)

      const { inserted, updated, deleted, unchanged } = result.stats
      const parts = [`${inserted} inserted`]
      if (updated > 0) parts.push(`${updated} updated`)
      if (deleted > 0) parts.push(`${deleted} deleted`)
      if (unchanged > 0) parts.push(`${unchanged} skipped (duplicates)`)
      toast.success('Upload Successful!', {
        description: parts.join(', '),
        duration: 5000,
      })
    } catch (error) {
      setUploadProgress(null)
      const rawMessage = getApiErrorMessage(error)

      if (rawMessage.includes('already imported') || rawMessage.includes('Use --force')) {
        setConflictError({ file, message: rawMessage })
        toast.error('File Already Uploaded', {
          description: 'This file has been uploaded before. Click "Force Reupload" to proceed anyway.',
          duration: 5000,
        })
      } else {
        toast.error('Upload Failed', {
          description: getUploadErrorMessage(error),
          duration: 6000,
        })
        setSelectedFile(null)
      }
    }
  }

  const handleForceReupload = () => {
    if (conflictError) {
      handleFileSelect(conflictError.file, true)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        handleFileSelect(acceptedFiles[0], false)
      }
    },
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: uploadMutation.isPending,
  })

  return (
    <div className="min-h-screen flex flex-col justify-center p-6 md:p-8 pb-24">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        {/* Hero Section with Upload */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-app-purple/10 to-secondary/20 border border-border"
        >
          {/* Background decoration */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative p-8 md:p-10">
            <div className="flex flex-col lg:flex-row gap-4 md:gap-6 lg:gap-8 items-center">
              {/* Left: Title & Info */}
              <div className="flex-1 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>Smart Sync</span>
                </div>
                <h1 className="text-4xl md:text-3xl sm:text-4xl md:text-5xl font-bold text-white">
                  Upload & Sync
                </h1>
                <p className="text-lg text-muted-foreground max-w-md">
                  Import your Excel transactions. We'll automatically detect changes and sync your data.
                </p>

                {/* Feature bullets */}
                <div className="flex flex-wrap gap-4 pt-2">
                  {[
                    { icon: CheckCircle2, text: 'Auto-detect duplicates' },
                    { icon: RefreshCw, text: 'Smart sync' },
                    { icon: FileSpreadsheet, text: '.xlsx & .xls' },
                  ].map((feature) => (
                    <div key={feature.text} className="flex items-center gap-2 text-sm text-foreground">
                      <feature.icon className="w-4 h-4 text-primary" />
                      <span>{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Upload Zone */}
              <div className="w-full lg:w-96 shrink-0">
                <div
                  {...getRootProps()}
                  className={cn(
                    'relative border-2 border-dashed rounded-2xl p-4 md:p-8 text-center cursor-pointer transition-colors duration-300',
                    'bg-black/20 backdrop-blur-sm',
                    'hover:border-primary hover:bg-primary/10',
                    isDragActive && 'border-primary bg-primary/20 scale-[1.02]',
                    uploadMutation.isPending && 'opacity-50 cursor-not-allowed',
                    selectedFile ? 'border-primary' : 'border-white/20'
                  )}
                >
                  <input {...getInputProps()} />

                  {uploadMutation.isPending ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                      </div>
                      <div>
                        <p className="font-semibold text-white">
                          {uploadProgress !== null && uploadProgress < 100
                            ? `Uploading... ${uploadProgress}%`
                            : 'Processing your data...'}
                        </p>
                        <p className="font-mono text-sm text-muted-foreground">{selectedFile?.name}</p>
                      </div>
                      {uploadProgress !== null && (
                        <div className="w-full max-w-[200px] bg-white/10 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className={cn(
                        'w-16 h-16 rounded-full flex items-center justify-center transition-colors',
                        isDragActive ? 'bg-primary/30 scale-110' : 'bg-primary/20'
                      )}>
                        <Upload className={cn(
                          'w-8 h-8 text-primary transition-transform',
                          isDragActive && 'scale-110'
                        )} />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-lg">
                          {isDragActive ? 'Drop your file here' : 'Drop Excel file here'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          or click to browse
                        </p>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-border">
                        <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">.xlsx, .xls supported</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Conflict Error */}
        {conflictError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 rounded-xl bg-app-yellow/10 border border-app-yellow/30 flex items-center gap-4 glow-error"
          >
            <div className="p-3 rounded-full bg-app-yellow/20">
              <AlertTriangle className="w-6 h-6 text-app-yellow" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-app-yellow">File Already Uploaded</h3>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono text-sm text-white">{conflictError.file.name}</span> was imported before. Re-upload to sync changes.
              </p>
            </div>
            <button
              onClick={handleForceReupload}
              disabled={uploadMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-app-yellow text-black rounded-lg hover:bg-app-yellow transition-colors font-medium disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', uploadMutation.isPending && 'animate-spin')} />
              Force Reupload
            </button>
          </motion.div>
        )}

        {/* Sample Format Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Expected Format</h2>
              <p className="text-sm text-muted-foreground">Your Excel should look like this</p>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-black/20 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-white/5">
                    <th className="px-4 py-3 text-left font-medium text-primary">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-primary">Account</th>
                    <th className="px-4 py-3 text-left font-medium text-primary">Category</th>
                    <th className="px-4 py-3 text-left font-medium text-primary">Subcategory</th>
                    <th className="px-4 py-3 text-left font-medium text-primary">Type</th>
                    <th className="px-4 py-3 text-right font-medium text-primary">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-primary">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_EXCEL_DATA.map((row) => (
                    <tr
                      key={`${row.date}-${row.amount}-${row.note}`}
                      className="border-b border-border hover:bg-white/10 transition-colors even:bg-white/5"
                    >
                      <td className="px-4 py-2.5 text-foreground font-mono text-xs">{row.date}</td>
                      <td className="px-4 py-2.5 text-foreground">{row.account}</td>
                      <td className="px-4 py-2.5 text-foreground">{row.category}</td>
                      <td className="px-4 py-2.5 text-text-tertiary">{row.subcategory}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'px-2 py-0.5 rounded border text-xs font-medium',
                          TYPE_STYLES[row.type] || 'bg-muted-foreground/20 text-muted-foreground'
                        )}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">
                        ₹{row.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-2.5 text-text-tertiary text-xs">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer tip */}
            <div className="px-4 py-3 border-t border-border bg-white/5 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                Column names are flexible — <span className="text-foreground">"Period"</span> or <span className="text-foreground">"Date"</span> both work.
                Export from Money Manager Pro for best results.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
