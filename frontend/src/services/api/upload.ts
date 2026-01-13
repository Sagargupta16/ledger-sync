import { apiClient } from './client'
import type { UploadResponse } from '@/types'

export const uploadService = {
  uploadFile: async (file: File, force: boolean = false): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post<UploadResponse>('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params: {
        force: force ? 'true' : 'false',
      },
    })

    return response.data
  },
}
