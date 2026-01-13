import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadService } from '@/services/api/upload'
import { toast } from 'sonner'

interface UploadParams {
  file: File
  force?: boolean
}

export function useUpload() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ file, force = false }: UploadParams) => uploadService.uploadFile(file, force),
    onSuccess: (data, variables) => {
      const isForce = variables.force
      toast.success(data.message || 'Upload successful!', {
        description: isForce
          ? `Force re-uploaded: ${data.stats.inserted} inserted, ${data.stats.updated} updated, ${data.stats.deleted} deleted`
          : `${data.stats.inserted} inserted, ${data.stats.updated} updated, ${data.stats.deleted} deleted`,
      })
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries()
    },
    onError: () => {
      // Don't show toast here - let the component handle it for better control
    },
  })
}
