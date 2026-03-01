/**
 * Authentication Hooks
 *
 * React Query hooks for authentication operations.
 * OAuth-only — login is handled via OAuth callback page.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as authApi from '@/services/api/auth'
import { prefetchCoreData } from '@/lib/prefetch'

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

  return useQuery({
    queryKey: ['auth', 'init'],
    queryFn: async () => {
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
 * Hook for resetting account to fresh state
 */
export const useResetAccount = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: authApi.resetAccount,
    onSuccess: () => {
      // Clear all cached data since account is reset
      queryClient.clear()
    },
  })
}
