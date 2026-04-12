/**
 * Authentication Hooks
 *
 * React Query hooks for authentication operations.
 * OAuth-only — login is handled via OAuth callback page.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { isDemoMode } from '@/store/demoStore'
import * as authApi from '@/services/api/auth'
import { prefetchCoreData } from '@/lib/prefetch'
import { seedDemoCache } from '@/lib/demo/seedDemoCache'
import { generateDemoPreferences } from '@/lib/demo/generateDerivedData'
import { usePreferencesStore } from '@/store/preferencesStore'
import { DEMO_USER } from '@/lib/demo/enterDemoMode'

export const AUTH_QUERY_KEY = ['auth', 'user']

/**
 * Hook for logout
 */
export const useLogout = () => {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      logout()
      queryClient.clear()
    },
    onError: () => {
      // Logout should always succeed client-side
      logout()
      queryClient.clear()
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
      const user = await authApi.getMe()
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
  const { accessToken, setLoading, logout, setUser } = useAuthStore()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['auth', 'init'],
    queryFn: async () => {
      // Demo mode: re-seed cache (handles browser refresh) and skip API
      if (isDemoMode()) {
        seedDemoCache(queryClient)
        usePreferencesStore.getState().hydrateFromApi(generateDemoPreferences())
        setUser(DEMO_USER)
        setLoading(false)
        return DEMO_USER
      }

      // Stale demo token from a closed tab — clean up
      if (accessToken === 'demo-token') {
        logout()
        setLoading(false)
        return null
      }

      if (!accessToken) {
        setLoading(false)
        return null
      }

      try {
        const user = await authApi.getMe()
        setUser(user)
        setLoading(false)
        // Returning user with valid token — prefetch all data
        prefetchCoreData()
        return user
      } catch {
        // Token invalid - logout
        logout()
        setLoading(false)
        return null
      }
    },
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

  return useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (user) => {
      updateUser(user)
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
    },
  })
}

/**
 * Hook for deleting user account permanently
 */
export const useDeleteAccount = () => {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: authApi.deleteAccount,
    onSuccess: () => {
      logout()
      queryClient.clear()
    },
  })
}

/**
 * Hook for resetting account data.
 * @param mode - "full" clears everything; "transactions" preserves preferences/budgets/goals
 */
export const useResetAccount = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mode: 'full' | 'transactions' = 'full') => authApi.resetAccount(mode),
    onSuccess: () => {
      // Clear all cached data since account is reset
      queryClient.clear()
    },
  })
}
