/**
 * Authentication Hooks
 *
 * React Query hooks for authentication operations.
 * OAuth-only login is handled via the callback page.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
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
 * Hook to initialize auth state on app load
 */
export const useAuthInit = () => {
  const isLoading = useAuthStore((state) => state.isLoading)
  const setLoading = useAuthStore((state) => state.setLoading)
  const setUser = useAuthStore((state) => state.setUser)
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
      } catch (error) {
        if (!isCurrentSession(signal)) return null
        // Offline or a 5xx says nothing about the credential: keep the stored
        // session and let each page show its own error state.
        const status = isAxiosError(error) ? error.response?.status : undefined
        if (status === 401 || status === 403) endSession(queryClient)
        else setLoading(false)
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
  const updateUser = useAuthStore((state) => state.updateUser)
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
