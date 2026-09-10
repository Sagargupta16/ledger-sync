/**
 * Authentication Hooks
 *
 * React Query hooks for authentication operations.
 * OAuth-only login is handled via the callback page.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { isDemoMode } from '@/store/demoStore'
import * as authApi from '@/services/api/auth'
import { prefetchCoreData } from '@/lib/prefetch'
import { seedDemoCache } from '@/lib/demo/seedDemoCache'
import { generateDemoPreferences } from '@/lib/demo/generateDerivedData'
import { usePreferencesStore } from '@/store/preferencesStore'
import { DEMO_USER, DEMO_TOKENS } from '@/lib/demo/enterDemoMode'
import {
  assertCurrentSession, clearSessionData, endSession, getSessionGeneration, getSessionSignal, isCurrentSession,
} from '@/lib/session'

export const AUTH_QUERY_KEY = ['auth', 'user']

/**
 * Hook for logout
 */
export const useLogout = () => {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['auth', 'logout', getSessionGeneration()],
    mutationFn: () => {
      assertCurrentSession(sessionSignal)
      return authApi.logout()
    },
    onMutate: () => sessionSignal,
    onSettled: (_data, _error, _variables, signal) => {
      if (signal && isCurrentSession(signal)) endSession(queryClient)
    },
  })
}

/**
 * Hook to get current user (verify session)
 */
export const useCurrentUser = () => {
  const { isAuthenticated, accessToken, setUser } = useAuthStore()

  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const signal = getSessionSignal()
      const user = await authApi.getMe()
      assertCurrentSession(signal)
      setUser(user)
      return user
    },
    enabled: isAuthenticated && !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/**
 * Hook to initialize auth state on app load
 */
export const useAuthInit = () => {
  const { isLoading, setLoading, setUser } = useAuthStore()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['auth', 'init'],
    queryFn: async () => {
      // Demo mode: re-seed cache (handles browser refresh) and skip API
      if (isDemoMode()) {
        clearSessionData(queryClient)
        useAuthStore.getState().login(DEMO_USER, DEMO_TOKENS)
        seedDemoCache(queryClient)
        usePreferencesStore.getState().hydrateFromApi(generateDemoPreferences())
        return DEMO_USER
      }

      const { accessToken } = useAuthStore.getState()
      if (!accessToken || accessToken === 'demo-token') {
        endSession(queryClient)
        return null
      }

      const signal = getSessionSignal()
      try {
        const user = await authApi.getMe()
        assertCurrentSession(signal)
        setUser(user)
        setLoading(false)
        prefetchCoreData()
        return user
      } catch {
        if (isCurrentSession(signal)) endSession(queryClient)
        return null
      }
    },
    enabled: isLoading,
    staleTime: Infinity, // Only run once
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/**
 * Hook for updating user profile
 */
export const useUpdateProfile = () => {
  const queryClient = useQueryClient()
  const { updateUser } = useAuthStore()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['auth', 'profile', getSessionGeneration()],
    mutationFn: (fullName: string) => {
      assertCurrentSession(sessionSignal)
      return authApi.updateProfile(fullName)
    },
    onMutate: () => sessionSignal,
    onSuccess: (user, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      updateUser(user)
      // Fire-and-forget: invalidateQueries resolves even when the refetch
      // fails (query-core catches internally), and the profile-update failure
      // itself is toasted by the global MutationCache onError.
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
    },
  })
}

/**
 * Hook for deleting user account permanently
 */
export const useDeleteAccount = () => {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['auth', 'delete-account', getSessionGeneration()],
    mutationFn: () => {
      assertCurrentSession(sessionSignal)
      return authApi.deleteAccount()
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (signal && isCurrentSession(signal)) endSession(queryClient)
    },
  })
}

/**
 * Hook for resetting account data.
 * @param mode - "full" clears everything; "transactions" preserves preferences/budgets/goals
 */
export const useResetAccount = () => {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['auth', 'reset-account', getSessionGeneration()],
    mutationFn: (mode: 'full' | 'transactions' = 'full') => {
      assertCurrentSession(sessionSignal)
      return authApi.resetAccount(mode)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, mode, signal) => {
      if (signal && isCurrentSession(signal)) clearSessionData(queryClient, mode !== 'transactions')
    },
  })
}
