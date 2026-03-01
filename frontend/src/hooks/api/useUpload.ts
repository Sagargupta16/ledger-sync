import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadService } from '@/services/api/upload'
import { prefetchCoreData } from '@/lib/prefetch'

interface UploadParams {
  file: File
  force?: boolean
}

export function useUpload() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ file, force = false }: UploadParams) => uploadService.uploadFile(file, force),
    onSuccess: () => {
      // 1. Clear ALL cached query data so no stale results linger
      queryClient.clear()
      // 2. Re-prefetch core data for all pages (runs in parallel)
      //    This ensures pages you navigate to next have fresh data
      //    instead of showing zeros while waiting for a lazy fetch.
      prefetchCoreData()
    },
  })
}
