import { useState } from 'react'
import { useUpload } from '@/hooks/api/useUpload'
import DropZone from '@/components/upload/DropZone'
import UploadResults from '@/components/upload/UploadResults'
import type { UploadResponse } from '@/types'
import { motion } from 'framer-motion'
import { FileText, Download, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export default function UploadSyncPage() {
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null)
  const [uploadTime, setUploadTime] = useState<Date | null>(null)
  const [conflictError, setConflictError] = useState<{ file: File; message: string } | null>(null)
  const uploadMutation = useUpload()

  const handleFileSelect = async (file: File, force: boolean = false) => {
    setConflictError(null)
    try {
      const result = await uploadMutation.mutateAsync({ file, force })
      setUploadResult(result)
      setUploadTime(new Date())
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const errorMessage = err.response?.data?.detail || err.message || 'An error occurred'

      // Check if it's a conflict error (file already imported)
      if (errorMessage.includes('already imported') || errorMessage.includes('Use --force')) {
        setConflictError({ file, message: errorMessage })
        toast.error('File Already Uploaded', {
          description: 'This file has been uploaded before. Click "Force Reupload" to proceed anyway.',
        })
      } else {
        toast.error('Upload failed', {
          description: errorMessage,
        })
      }
    }
  }

  const handleForceReupload = () => {
    if (conflictError) {
      handleFileSelect(conflictError.file, true)
    }
  }

  const downloadTemplate = () => {
    // TODO: Add template download functionality
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Upload & Sync
          </h1>
          <p className="text-muted-foreground">
            Upload your Excel files to sync transactions and tax data with the database
          </p>
        </motion.div>

        {/* Section: Transaction Upload */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-4"
        >
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Transaction Upload
          </h2>
        </motion.div>

        {/* Template Download Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-between p-4 glass rounded-xl border border-white/10 shadow-xl hover:shadow-2xl hover:shadow-primary/20 transition-all duration-300"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg shadow-lg shadow-primary/30">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Need a template?</h3>
              <p className="text-sm text-muted-foreground">
                Download the Excel template to get started
              </p>
            </div>
          </div>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg hover:shadow-primary/50 transition-all duration-300 hover:scale-105"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">Download Template</span>
          </button>
        </motion.div>

        {/* Upload Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <DropZone
            onFileSelect={(file) => handleFileSelect(file, false)}
            isUploading={uploadMutation.isPending}
          />
        </motion.div>

        {/* Conflict Error - Force Reupload */}
        {conflictError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 glass border-2 border-yellow-500/50 rounded-xl space-y-4 shadow-xl shadow-yellow-500/20"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 bg-yellow-500/20 rounded-lg shadow-lg shadow-yellow-500/30">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">File Already Uploaded</h3>
                <p className="text-sm text-muted-foreground mb-1">
                  <span className="font-medium text-foreground">{conflictError.file.name}</span> has been uploaded
                  previously.
                </p>
                <p className="text-sm text-muted-foreground">
                  If you want to re-import this file and update the database, click the button below.
                </p>
              </div>
            </div>
            <button
              onClick={handleForceReupload}
              disabled={uploadMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-400 hover:shadow-lg hover:shadow-yellow-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${uploadMutation.isPending ? 'animate-spin' : ''}`} />
              {uploadMutation.isPending ? 'Re-uploading...' : 'Force Reupload'}
            </button>
          </motion.div>
        )}

        {/* Upload Results */}
        {uploadResult && uploadTime && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <UploadResults
              stats={uploadResult.stats}
              fileName={uploadResult.file_name}
              uploadTime={uploadTime}
            />
          </motion.div>
        )}

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="p-6 glass border border-white/10 rounded-xl space-y-3 shadow-xl"
        >
          <h3 className="font-semibold">How it works:</h3>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Upload your Excel file using the drag-and-drop area above</li>
            <li>The system will automatically sync transactions using deterministic hashing</li>
            <li>
              New transactions will be <span className="text-green-500 font-medium">inserted</span>
            </li>
            <li>
              Modified transactions will be <span className="text-blue-500 font-medium">updated</span>
            </li>
            <li>
              Removed transactions will be <span className="text-red-500 font-medium">soft-deleted</span>
            </li>
            <li>View the sync results immediately after upload completes</li>
          </ol>
        </motion.div>
      </div>
    </div>
  )
}

