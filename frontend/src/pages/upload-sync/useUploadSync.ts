import { useState } from 'react'

import type { AxiosError } from 'axios'
import { toast } from 'sonner'

import { useUpload } from '@/hooks/api/useUpload'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { FileParseError, parseFile, type ParseResult } from '@/lib/fileParser'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { uploadService } from '@/services/api/upload'

export type UploadPhase = 'parsing' | 'processing' | 'analytics' | null

export interface UploadConflict {
  readonly parsed: ParseResult
}

export interface UploadFailure {
  readonly parsed: ParseResult
  readonly message: string
  readonly force: boolean
}

function getUploadErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError
  if (axiosError.code === 'ECONNABORTED') {
    return 'Request timed out. The server may be busy -- please try again.'
  }
  if (axiosError.code === 'ERR_NETWORK') {
    return 'Could not reach the server. Check your internet connection and try again.'
  }

  const message = getApiErrorMessage(error)
  if (message === 'FUNCTION_INVOCATION_TIMEOUT') {
    return 'Server took too long to process. Please try again in a moment.'
  }
  return message
}

function isDuplicateUpload(message: string): boolean {
  return message.includes('already imported') || message.includes('Use --force')
}

export function useUploadSync() {
  const [conflict, setConflict] = useState<UploadConflict | null>(null)
  const [failure, setFailure] = useState<UploadFailure | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [phase, setPhase] = useState<UploadPhase>(null)
  const uploadMutation = useUpload()
  const { guardDemoAction } = useDemoGuard()

  const uploadParsedFile = async (parsed: ParseResult, force: boolean) => {
    setFailure(null)
    setPhase('processing')

    try {
      const result = await uploadMutation.mutateAsync({
        fileName: parsed.fileName,
        fileHash: parsed.fileHash,
        rows: parsed.rows,
        force,
      })

      setPhase('analytics')
      try {
        await uploadService.refreshAnalytics()
      } catch {
        toast.warning('Analytics refresh failed -- dashboard may show stale data until next upload.')
      }

      const { inserted, updated, deleted, unchanged } = result.stats
      const parts = [`${inserted} inserted`]
      if (updated > 0) parts.push(`${updated} updated`)
      if (deleted > 0) parts.push(`${deleted} deleted`)
      if (unchanged > 0) parts.push(`${unchanged} skipped (duplicates)`)

      setPhase(null)
      setSelectedFileName(null)
      setConflict(null)
      toast.success(force ? 'Reupload Successful!' : 'Upload Successful!', {
        description: force
          ? parts.join(', ')
          : `${parsed.rows.length} rows parsed. ${parts.join(', ')}.`,
        duration: 5000,
      })
    } catch (error) {
      const rawMessage = getApiErrorMessage(error)
      setPhase(null)

      if (!force && isDuplicateUpload(rawMessage)) {
        setConflict({ parsed })
        toast.error('File Already Uploaded', {
          description: 'This file has been uploaded before. Click "Force Reupload" to proceed anyway.',
          duration: 5000,
        })
        return
      }

      const message = getUploadErrorMessage(error)
      setSelectedFileName(null)
      setFailure({ parsed, message, force })
      toast.error(force ? 'Reupload Failed' : 'Upload Failed', {
        description: message,
        duration: 6000,
      })
    }
  }

  const handleFileSelect = async (file: File) => {
    if (guardDemoAction('File upload')) return

    setConflict(null)
    setFailure(null)
    setSelectedFileName(file.name)
    setPhase('parsing')

    let parsed: ParseResult
    try {
      parsed = await parseFile(file)
    } catch (error) {
      setPhase(null)
      setSelectedFileName(null)
      const message = error instanceof FileParseError
        ? error.message
        : 'Could not read file. Ensure it is a valid .xlsx, .xls, or .csv file.'
      toast.error('Parse Error', { description: message, duration: 6000 })
      return
    }

    await uploadParsedFile(parsed, false)
  }

  const handleForceReupload = async () => {
    if (!conflict) return
    const { parsed } = conflict
    setConflict(null)
    setSelectedFileName(parsed.fileName)
    await uploadParsedFile(parsed, true)
  }

  const handleRetryUpload = async () => {
    if (!failure) return
    const { parsed, force } = failure
    setFailure(null)
    setSelectedFileName(parsed.fileName)
    await uploadParsedFile(parsed, force)
  }

  return {
    conflict,
    failure,
    selectedFileName,
    phase,
    isBusy: phase !== null,
    handleFileSelect,
    handleForceReupload,
    handleRetryUpload,
  }
}
