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
          isAuthenticated: !!user && !!get().accessToken,
        }),

      // Set tokens
      setTokens: (tokens) => {
        if (tokens) {
          set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            isAuthenticated: !!get().user && !!tokens.access_token,
          })
        } else {
          set({
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          })
        }
      },

      // Set loading state
      setLoading: (loading) => set({ isLoading: loading }),

      // Login action
      login: (user, tokens) => {
        set({
          user,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          isAuthenticated: true,
          isLoading: false,
        })
      },

      // Logout action
      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
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
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      // After hydrating from localStorage, compute isAuthenticated from
      // the restored user + accessToken so ProtectedRoute works on reload.
      onRehydrateStorage: () => (state, error) => {
        if (!error && state) {
          state.isAuthenticated = !!state.accessToken && !!state.user
        }
      },
    }
  )
)

// Utility functions for non-React contexts (e.g., Axios interceptors)
export const getAccessToken = () => useAuthStore.getState().accessToken
export const getRefreshToken = () => useAuthStore.getState().refreshToken
export const isAuthenticated = () => {
  const state = useAuthStore.getState()
  return !!state.accessToken && !!state.user
}

// Selectors for React components (enable Zustand render optimization)
export const selectAccessToken = (state: AuthState) => state.accessToken
export const selectUser = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => !!state.accessToken && !!state.user
