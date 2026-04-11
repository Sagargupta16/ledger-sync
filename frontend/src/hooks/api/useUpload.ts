import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadService } from '@/services/api/upload'
import { prefetchCoreData } from '@/lib/prefetch'
import type { ParsedTransaction } from '@/lib/fileParser'

interface UploadParams {
  fileName: string
  fileHash: string
  rows: ParsedTransaction[]
  force?: boolean
}

export function useUpload() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ fileName, fileHash, rows, force = false }: UploadParams) =>
      uploadService.uploadTransactions({ fileName, fileHash, rows, force }),
    onSuccess: () => {
      queryClient.clear()
      prefetchCoreData()
    },
  })
}
