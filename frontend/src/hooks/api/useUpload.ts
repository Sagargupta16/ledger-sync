import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadService } from '@/services/api/upload'

interface UploadParams {
  file: File
  force?: boolean
}

export function useUpload() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ file, force = false }: UploadParams) => uploadService.uploadFile(file, force),
    onSuccess: () => {
      // Clear all cached data so every page fetches fresh results on mount.
      queryClient.clear()
    },
    onError: () => {
      // Don't show toast here - let the component handle it for better control
    },
  })
}
