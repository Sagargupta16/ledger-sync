/**
 * Authentication Store
 *
 * Zustand store for managing authentication state including:
 * - User session
 * - JWT tokens
 * - Login/logout functionality
 */

import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type { User, AuthTokens } from '@/types'

/** The access token a demo session holds; it never reaches the backend. */
export const DEMO_ACCESS_TOKEN = 'demo-token'

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

type PersistedAuth = Partial<Pick<AuthState, 'user' | 'accessToken' | 'refreshToken'>>

/**
 * localStorage, minus demo sessions. Every tab shares this one entry, and a
 * demo session is rebuilt on reload from its own tab's sessionStorage flag
 * (`useAuthInit`), so it has nothing to keep here. Writing it would replace a
 * real sign-in another tab stored, and that tab's next reload would find the
 * demo token without a demo flag and sign out.
 */
const authStorage: PersistStorage<PersistedAuth> = {
  getItem: (name) => {
    const raw = localStorage.getItem(name)
    return raw === null ? null : (JSON.parse(raw) as StorageValue<PersistedAuth>)
  },
  setItem: (name, value) => {
    if (value.state.accessToken === DEMO_ACCESS_TOKEN) return
    localStorage.setItem(name, JSON.stringify(value))
  },
  removeItem: (name) => localStorage.removeItem(name),
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
        // Persisting the logged-out state overwrites the shared entry, so put
        // back a different account's sign-in that another tab stored meanwhile.
        const otherAccount = otherAccountEntry(get().user)
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        })
        if (otherAccount) localStorage.setItem(AUTH_STORAGE_KEY, otherAccount)
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
      storage: authStorage,
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

/** The raw stored entry when it holds a signed-in account other than `user`. */
function otherAccountEntry(user: User | null): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    const persisted = (JSON.parse(raw ?? 'null') as { state?: PersistedAuth } | null)?.state
    return raw && persisted?.accessToken && persisted.user && persisted.user.id !== user?.id ? raw : null
  } catch {
    return null
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
