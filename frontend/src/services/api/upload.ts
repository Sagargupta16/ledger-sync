import { apiClient } from './client'
import type { UploadResponse } from '@/types'
import type { ParsedTransaction } from '@/lib/fileParser'

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
    })

    return response.data
  },
}
