import { CanceledError } from 'axios'
import type { QueryClient } from '@tanstack/react-query'
import { useAuthStore, type AuthState } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useAccountStore } from '@/store/accountStore'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { queryClient } from './queryClient'

let sessionController = new AbortController()
let sessionGeneration = 0

/** Capture before starting work; a token refresh keeps the same session. */
export const getSessionSignal = () => sessionController.signal
/** Prevent mutation observers from replacing queued work with a newer session's options. */
export const getSessionGeneration = () => sessionGeneration

export const isCurrentSession = (signal: AbortSignal) =>
  signal === sessionController.signal && !signal.aborted

export function assertCurrentSession(signal: AbortSignal): void {
  if (!isCurrentSession(signal)) throw new CanceledError('Session changed')
}

/**
 * Cancel before clearing so a late request cannot refill the next user's cache.
 * The controller also covers mutations and requests outside TanStack Query.
 */
export function clearSessionData(client: QueryClient = queryClient, resetStores = true): void {
  sessionController.abort()
  sessionController = new AbortController()
  sessionGeneration += 1

  for (const cache of new Set([queryClient, client])) {
    void cache.cancelQueries()
    cache.clear()
  }

  if (resetStores) {
    useBudgetStore.getState().clearBudgets()
    useAccountStore.getState().reset()
    useInvestmentAccountStore.getState().reset()
    usePreferencesStore.getState().reset()
  }
}

export function endSession(client: QueryClient = queryClient): void {
  clearSessionData(client)
  useDemoStore.getState().exitDemo()
  useAuthStore.getState().logout()
}

function identity(state: AuthState): string {
  if (!state.accessToken) return 'anonymous'
  if (state.accessToken === 'demo-token') return 'demo'
  return `${state.user?.auth_provider ?? ''}:${state.user?.id ?? 'pending'}`
}

// Observe the store itself so OAuth login, direct logout and demo transitions
// all use the same boundary, including callers outside the authentication hooks.
useAuthStore.subscribe((state, previous) => {
  if (identity(state) !== identity(previous)) clearSessionData()
})
