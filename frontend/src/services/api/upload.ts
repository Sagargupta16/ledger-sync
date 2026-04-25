import type { UploadResponse } from '@/types'
import type { ParsedTransaction } from '@/lib/fileParser'

import { apiClient } from './client'

interface UploadPayload {
  fileName: string
  fileHash: string
  rows: ParsedTransaction[]
  force?: boolean
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
      timeout: 120_000,
    })

    return response.data
  },

  refreshAnalytics: async (): Promise<void> => {
    await apiClient.post('/api/analytics/v2/refresh', null, {
      timeout: 120_000,
    })
  },
}
