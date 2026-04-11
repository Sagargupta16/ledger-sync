import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadService } from '@/services/api/upload'
import { prefetchCoreData } from '@/lib/prefetch'

interface UploadParams {
  file: File
  force?: boolean
  onUploadProgress?: (percent: number) => void
}

export function useUpload() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ file, force = false, onUploadProgress }: UploadParams) =>
      uploadService.uploadFile({ file, force, onUploadProgress }),
    onSuccess: () => {
      queryClient.clear()
      prefetchCoreData()
    },
  })
}
