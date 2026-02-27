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
      // Remove all cached data and force refetch for any active queries.
      // resetQueries clears the cache entirely so that navigating to any
      // page triggers a fresh fetch instead of serving stale data.
      queryClient.resetQueries()
    },
    onError: () => {
      // Don't show toast here - let the component handle it for better control
    },
  })
}
