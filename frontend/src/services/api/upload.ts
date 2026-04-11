import { apiClient } from './client'
import type { UploadResponse } from '@/types'

interface UploadOptions {
  file: File
  force?: boolean
  onUploadProgress?: (percent: number) => void
}

export const uploadService = {
  uploadFile: async ({ file, force = false, onUploadProgress }: UploadOptions): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post<UploadResponse>('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params: {
        force: force ? 'true' : 'false',
      },
      timeout: 90_000,
      onUploadProgress: onUploadProgress
        ? (event) => {
            const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0
            onUploadProgress(percent)
          }
        : undefined,
    })

    return response.data
  },
}
