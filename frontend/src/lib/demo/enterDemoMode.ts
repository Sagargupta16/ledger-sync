import type { NavigateFunction } from 'react-router-dom'

import type { QueryClient } from '@tanstack/react-query'

import { useDemoStore } from '@/store/demoStore'
import { useAuthStore } from '@/store/authStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { ROUTES } from '@/constants'

import { seedDemoCache } from './seedDemoCache'
import { generateDemoPreferences } from './generateDerivedData'

export const DEMO_USER = {
  id: 0,
  email: 'demo@ledger-sync.app',
  full_name: 'Demo User',
  is_active: true,
  is_verified: true,
  auth_provider: 'demo',
  created_at: new Date().toISOString(),
  last_login: new Date().toISOString(),
} as const

export const DEMO_TOKENS = {
  access_token: 'demo-token',
  refresh_token: 'demo-refresh',
  token_type: 'bearer',
} as const

export function enterDemoMode(queryClient: QueryClient, navigate: NavigateFunction): void {
  // 1. Set demo flag
  useDemoStore.getState().enterDemo()

  // 2. Set fake authenticated user (satisfies ProtectedRoute)
  useAuthStore.getState().login(DEMO_USER, DEMO_TOKENS)

  // 3. Seed TanStack Query cache with sample data
  seedDemoCache(queryClient)

  // 4. Hydrate preferences store (PreferencesProvider won't fetch from API)
  usePreferencesStore.getState().hydrateFromApi(generateDemoPreferences())

  // 5. Navigate to dashboard
  navigate(ROUTES.DASHBOARD)
}
