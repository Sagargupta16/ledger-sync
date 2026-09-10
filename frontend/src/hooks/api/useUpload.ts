import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadService } from '@/services/api/upload'
import { prefetchCoreData } from '@/lib/prefetch'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import type { ParsedTransaction } from '@/lib/fileParser'

interface UploadParams {
  fileName: string
  fileHash: string
  rows: ParsedTransaction[]
  force?: boolean
}

export function useUpload() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['upload', getSessionGeneration()],
    mutationFn: ({ fileName, fileHash, rows, force = false }: UploadParams) => {
      assertCurrentSession(sessionSignal)
      return uploadService.uploadTransactions({ fileName, fileHash, rows, force })
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      queryClient.clear()
      prefetchCoreData()
    },
  })
}
