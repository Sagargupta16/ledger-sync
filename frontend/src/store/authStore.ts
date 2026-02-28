/**
 * Authentication Store
 *
 * Zustand store for managing authentication state including:
 * - User session
 * - JWT tokens
 * - Login/logout functionality
 * - Session ID to prevent stale token refresh races
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

  // Session guard — incremented on every login/logout to prevent
  // stale 401 interceptor refreshes from overwriting new tokens.
  sessionId: number

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
      sessionId: 0,

      // Set user
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user && !!get().accessToken,
        }),

      // Set tokens (used by 401 interceptor for refresh)
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

      // Login action — increments sessionId to invalidate any in-flight 401 refreshes
      login: (user, tokens) => {
        set({
          user,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          isAuthenticated: true,
          isLoading: false,
          sessionId: get().sessionId + 1,
        })
      },

      // Logout action — increments sessionId to invalidate any in-flight 401 refreshes
      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
          sessionId: get().sessionId + 1,
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
export const getSessionId = () => useAuthStore.getState().sessionId
export const isAuthenticated = () => {
  const state = useAuthStore.getState()
  return !!state.accessToken && !!state.user
}

// Selectors for React components (enable Zustand render optimization)
export const selectAccessToken = (state: AuthState) => state.accessToken
export const selectUser = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => !!state.accessToken && !!state.user
