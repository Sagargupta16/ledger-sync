import type { UploadResponse } from '@/types'
import type { ParsedTransaction } from '@/lib/fileParser'

import { apiClient } from './client'

interface UploadPayload {
  fileName: string
  fileHash: string
  rows: ParsedTransaction[]
  force?: boolean
}

// Uploads and the synchronous analytics rebuild can take a while on large files.
const UPLOAD_TIMEOUT_MS = 120_000

/** One past import from `GET /api/upload/history`. */
export interface ImportHistoryEntry {
  id: number
  file_name: string
  file_hash: string
  /** UTC ISO-8601 -- the backend attaches the offset explicitly. */
  imported_at: string
  rows_processed: number
  rows_inserted: number
  rows_updated: number
  rows_deleted: number
  rows_skipped: number
}

export interface ImportHistoryResponse {
  imports: ImportHistoryEntry[]
  total_count: number
}

export const uploadService = {
  uploadTransactions: async ({
    fileName,
    fileHash,
    rows,
    force = false,
  }: UploadPayload): Promise<UploadResponse> => {
    const response = await apiClient.post<UploadResponse>('/api/upload', {
      file_name: fileName,
      file_hash: fileHash,
      rows,
      force,
    }, {
      timeout: UPLOAD_TIMEOUT_MS,
    })

    return response.data
  },

  refreshAnalytics: async (): Promise<void> => {
    await apiClient.post('/api/analytics/v2/refresh', null, {
      timeout: UPLOAD_TIMEOUT_MS,
    })
  },

  /**
   * Past imports, most recent first. `limit` is a QUERY param -- the handler
   * declares it on its signature, so sending it as a body would 422.
   */
  getImportHistory: async (limit = 10): Promise<ImportHistoryResponse> => {
    const response = await apiClient.get<ImportHistoryResponse>('/api/upload/history', {
      params: { limit },
    })

    return response.data
  },
}
