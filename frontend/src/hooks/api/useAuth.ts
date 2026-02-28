/**
 * Authentication Hook
 *
 * React Query hooks for authentication operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as authApi from '@/services/api/auth'
import type { LoginCredentials, RegisterCredentials } from '@/types'

export const AUTH_QUERY_KEY = ['auth', 'user']

/**
 * Hook for user login
 */
export const useLogin = () => {
  const queryClient = useQueryClient()
  const { login, setTokens } = useAuthStore()

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const tokens = await authApi.login(credentials)
      setTokens(tokens)
      const user = await authApi.getMe()
      return { tokens, user }
    },
    onSuccess: ({ tokens, user }) => {
      // Cancel in-flight queries, then wipe cache to prevent stale data
      queryClient.cancelQueries()
      queryClient.clear()
      login(user, tokens)
    },
  })
}

/**
 * Hook for user registration
 */
export const useRegister = () => {
  const queryClient = useQueryClient()
  const { login, setTokens } = useAuthStore()

  return useMutation({
    mutationFn: async (credentials: RegisterCredentials) => {
      const tokens = await authApi.register(credentials)
      setTokens(tokens)
      const user = await authApi.getMe()
      return { tokens, user }
    },
    onSuccess: ({ tokens, user }) => {
      queryClient.cancelQueries()
      queryClient.clear()
      login(user, tokens)
    },
  })
}

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

/**
 * Hook for demo user login (one-click, no credentials needed)
 */
export const useDemoLogin = () => {
  const queryClient = useQueryClient()
  const { login, setTokens } = useAuthStore()

  return useMutation({
    mutationFn: async () => {
      const tokens = await authApi.demoLogin()
      setTokens(tokens)
      const user = await authApi.getMe()
      return { tokens, user }
    },
    onSuccess: ({ tokens, user }) => {
      queryClient.cancelQueries()
      queryClient.clear()
      login(user, tokens)
    },
  })
}
