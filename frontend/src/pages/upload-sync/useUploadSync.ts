import { useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { toast } from 'sonner'

import { useUpload } from '@/hooks/api/useUpload'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { FileParseError, parseFile, type ParseResult } from '@/lib/fileParser'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { uploadService } from '@/services/api/upload'

export type UploadPhase = 'parsing' | 'review' | 'processing' | 'analytics' | null

export interface UploadReview {
  readonly parsed: ParseResult
  readonly force: boolean
}

export interface UploadConflict {
  readonly parsed: ParseResult
}

export interface UploadFailure {
  readonly parsed: ParseResult | null
  readonly fileName: string
  readonly message: string
  readonly force: boolean
}

export interface UploadSuccess {
  readonly fileName: string
  readonly summary: string
  readonly analyticsStatus: 'ready' | 'failed' | 'unknown'
  readonly analyticsMessage: string | null
}

function getUploadErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError
  if (axiosError.code === 'ECONNABORTED') {
    return 'The request timed out. Check import history before retrying; the server may have saved your ledger.'
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
  const [review, setReview] = useState<UploadReview | null>(null)
  const [conflict, setConflict] = useState<UploadConflict | null>(null)
  const [failure, setFailure] = useState<UploadFailure | null>(null)
  const [success, setSuccess] = useState<UploadSuccess | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [phase, setPhase] = useState<UploadPhase>(null)
  const uploadMutation = useUpload()
  const queryClient = useQueryClient()
  const busy = useRef(false)
  const { guardDemoAction } = useDemoGuard()

  const uploadParsedFile = async (parsed: ParseResult, force: boolean) => {
    if (busy.current) return
    busy.current = true
    setFailure(null)
    setReview(null)
    setPhase('processing')

    try {
      const result = await uploadMutation.mutateAsync({
        fileName: parsed.fileName,
        fileHash: parsed.fileHash,
        rows: parsed.rows,
        force,
      })

      const { inserted, updated, deleted, unchanged } = result.stats
      const parts = [`${inserted} inserted`]
      if (updated > 0) parts.push(`${updated} updated`)
      if (deleted > 0) parts.push(`${deleted} removed`)
      if (unchanged > 0) parts.push(`${unchanged} unchanged or paired transfer rows`)

      const summary = force
        ? parts.join(', ')
        : `${parsed.rows.length} rows parsed. ${parts.join(', ')}.`

      setPhase(null)
      setSelectedFileName(null)
      setConflict(null)
      setSuccess({
        fileName: parsed.fileName,
        summary,
        analyticsStatus: result.analytics_status ?? 'unknown',
        analyticsMessage: result.analytics_message ?? null,
      })
      toast.success('Ledger saved', {
        description: summary,
        duration: 5000,
      })
    } catch (error) {
      const rawMessage = getApiErrorMessage(error)
      setPhase(null)

      if (!force && isDuplicateUpload(rawMessage)) {
        setConflict({ parsed })
        toast.error('File Already Uploaded', {
          description: 'This file has been uploaded before. Choose "Sync changes" to continue.',
          duration: 5000,
        })
        return
      }

      const message = getUploadErrorMessage(error)
      setSelectedFileName(null)
      setFailure({ parsed, fileName: parsed.fileName, message, force })
      toast.error(force ? 'Reupload Failed' : 'Upload Failed', {
        description: message,
        duration: 6000,
      })
    } finally {
      busy.current = false
    }
  }

  const handleFileSelect = async (file: File) => {
    if (busy.current || guardDemoAction('File upload')) return

    busy.current = true
    setReview(null)
    setConflict(null)
    setFailure(null)
    setSuccess(null)
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
      setFailure({ parsed: null, fileName: file.name, message, force: false })
      return
    } finally {
      busy.current = false
    }

    setReview({ parsed, force: false })
    setPhase('review')
  }

  const handleForceReupload = () => {
    if (!conflict) return
    const { parsed } = conflict
    setConflict(null)
    setSelectedFileName(parsed.fileName)
    setReview({ parsed, force: true })
    setPhase('review')
  }

  const handleRetryUpload = async () => {
    if (!failure?.parsed) return
    const { parsed, force } = failure
    setFailure(null)
    setSelectedFileName(parsed.fileName)
    await uploadParsedFile(parsed, force)
  }

  const handleConfirmUpload = async () => {
    if (review) await uploadParsedFile(review.parsed, review.force)
  }

  const handleCancelReview = () => {
    setReview(null)
    setSelectedFileName(null)
    setPhase(null)
  }

  const handleRetryAnalytics = async () => {
    if (!success || busy.current) return
    busy.current = true
    setPhase('analytics')
    try {
      await uploadService.refreshAnalytics()
      await queryClient.invalidateQueries()
      setSuccess({ ...success, analyticsStatus: 'ready', analyticsMessage: null })
      toast.success('Insights refreshed')
    } catch (error) {
      setSuccess({
        ...success,
        analyticsStatus: 'failed',
        analyticsMessage: getUploadErrorMessage(error),
      })
    } finally {
      busy.current = false
      setPhase(null)
    }
  }

  return {
    review,
    conflict,
    failure,
    success,
    selectedFileName,
    phase,
    isBusy: phase !== null && phase !== 'review',
    handleFileSelect,
    handleForceReupload,
    handleRetryUpload,
    handleConfirmUpload,
    handleCancelReview,
    handleRetryAnalytics,
  }
}
