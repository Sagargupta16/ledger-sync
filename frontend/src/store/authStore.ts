/**
 * Authentication Store
 *
 * Zustand store for managing authentication state including:
 * - User session
 * - JWT tokens
 * - Login/logout functionality
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthTokens } from '@/types'

export interface AuthState {
  // User state
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean

  // Token management
  accessToken: string | null
  refreshToken: string | null

  // Actions
  setUser: (user: User | null) => void
  setTokens: (tokens: AuthTokens | null) => void
  setLoading: (loading: boolean) => void
  login: (user: User, tokens: AuthTokens) => void
  logout: () => void
  updateUser: (updates: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: true,
      accessToken: null,
      refreshToken: null,

      // Set user
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      // Set tokens
      setTokens: (tokens) => {
        if (tokens) {
          set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
          })
        } else {
          set({
            accessToken: null,
            refreshToken: null,
          })
        }
      },

      // Set loading state
      setLoading: (loading) => set({ isLoading: loading }),

      // Login action
      login: (user, tokens) => {
        set({
          user,
          isAuthenticated: true,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          isLoading: false,
        })
      },

      // Logout action
      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
          accessToken: null,
          refreshToken: null,
          isLoading: false,
        })
      },

      // Update user
      updateUser: (updates) => {
        const currentUser = get().user
        if (currentUser) {
          set({
            user: { ...currentUser, ...updates },
          })
        }
      },
    }),
    {
      name: 'ledger-sync-auth',
      // Only persist tokens and user data
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
)

// Utility functions
export const getAccessToken = () => useAuthStore.getState().accessToken
export const getRefreshToken = () => useAuthStore.getState().refreshToken
export const isAuthenticated = () => useAuthStore.getState().isAuthenticated
