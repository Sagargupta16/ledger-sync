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

const AUTH_STORAGE_KEY = 'ledger-sync-auth'

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: true,
      accessToken: null,
      refreshToken: null,

      // Set user (uses callback form to read consistent state)
      setUser: (user) =>
        set((state) => ({
          user,
          isAuthenticated: !!user && !!state.accessToken,
        })),

      // Set tokens (uses callback form to read consistent state)
      setTokens: (tokens) => {
        if (tokens) {
          set((state) => ({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            isAuthenticated: !!state.user && !!tokens.access_token,
          }))
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
      name: AUTH_STORAGE_KEY,
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

type PersistedAuth = Partial<Pick<AuthState, 'user' | 'accessToken' | 'refreshToken'>>

/** Unverified `exp` claim, used only to order two tokens this browser already holds. */
function tokenExpiry(token: string | null | undefined): number {
  const payload = token?.split('.')[1]
  if (!payload) return 0
  try {
    const claims: unknown = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')))
    const exp = (claims as { exp?: unknown } | null)?.exp
    return typeof exp === 'number' ? exp : 0
  } catch {
    return 0
  }
}

/**
 * Adopt a newer token pair that another tab persisted for the same user.
 *
 * Refresh tokens are single-use and every tab shares one storage entry, so a
 * tab still holding a pair another tab already rotated would replay a used
 * token and end the session everywhere. A different user's tokens are never
 * adopted; account switches go through the session boundary instead.
 */
export function adoptPersistedTokens(): void {
  let persisted: PersistedAuth | undefined
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null') as
      | { state?: PersistedAuth }
      | null
    persisted = stored?.state
  } catch {
    return
  }
  const current = useAuthStore.getState()
  if (
    !persisted?.accessToken ||
    !persisted.refreshToken ||
    !current.user ||
    persisted.user?.id !== current.user.id ||
    tokenExpiry(persisted.refreshToken) <= tokenExpiry(current.refreshToken)
  ) {
    return
  }
  current.setTokens({
    access_token: persisted.accessToken,
    refresh_token: persisted.refreshToken,
    token_type: 'bearer',
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === AUTH_STORAGE_KEY) adoptPersistedTokens()
  })
}

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
