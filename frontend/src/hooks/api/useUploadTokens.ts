/**
 * Upload tokens: long-lived, upload-only credentials for an iPhone Shortcut
 * (or any client that cannot run OAuth) that posts Money Manager backups.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { uploadTokensService, type UploadToken } from '@/services/api/uploadTokens'
import { useDemoStore } from '@/store/demoStore'

export const UPLOAD_TOKENS_KEY = ['upload-tokens'] as const

/** Refetch the list, unless the session that started the write has ended. */
function refreshTokens(queryClient: QueryClient, signal: AbortSignal | undefined) {
  if (!signal || !isCurrentSession(signal)) return
  void queryClient.invalidateQueries({ queryKey: UPLOAD_TOKENS_KEY })
}

export function useUploadTokens() {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)

  return useQuery({
    queryKey: UPLOAD_TOKENS_KEY,
    queryFn: () => uploadTokensService.listTokens(),
    staleTime: Infinity,
    // Demo mode has no account to hold tokens, and its adapter would answer
    // this route with a bare `[]`.
    enabled: !isDemoMode,
  })
}

/**
 * The response carries the plaintext token, returned only this once. Callers
 * copy it into component state and `reset()` the mutation; `gcTime: 0` then
 * drops the settled mutation, so the secret does not stay in the cache.
 */
export function useCreateUploadToken() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...UPLOAD_TOKENS_KEY, 'create', getSessionGeneration()],
    mutationFn: (name: string) => {
      assertCurrentSession(sessionSignal)
      return uploadTokensService.createToken(name)
    },
    gcTime: 0,
    onMutate: () => sessionSignal,
    onSuccess: (_created, _name, signal) => refreshTokens(queryClient, signal),
    // A 409 usually means this list is stale (tokens made on another device).
    // Handling onError here also leaves the message to the form, not a toast.
    onError: (_error, _name, signal) => refreshTokens(queryClient, signal),
  })
}

export function useRevokeUploadToken() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...UPLOAD_TOKENS_KEY, 'revoke', getSessionGeneration()],
    mutationFn: (id: number) => {
      assertCurrentSession(sessionSignal)
      return uploadTokensService.revokeToken(id)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, id, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Drop the row at once, so a revoked token never reads as active even
      // if the refetch below fails.
      queryClient.setQueryData<UploadToken[]>(UPLOAD_TOKENS_KEY, (tokens) =>
        tokens?.filter((token) => token.id !== id))
      refreshTokens(queryClient, signal)
    },
    // The row shows the failure; the refetch catches a token already gone.
    onError: (_error, _id, signal) => refreshTokens(queryClient, signal),
  })
}
