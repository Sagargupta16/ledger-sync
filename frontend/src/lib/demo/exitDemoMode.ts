import type { QueryClient } from '@tanstack/react-query'
import type { NavigateFunction } from 'react-router-dom'
import { useDemoStore } from '@/store/demoStore'
import { useAuthStore } from '@/store/authStore'

export function exitDemoMode(queryClient: QueryClient, navigate: NavigateFunction): void {
  // 1. Clear demo flag
  useDemoStore.getState().exitDemo()

  // 2. Logout fake user (clears tokens from localStorage)
  useAuthStore.getState().logout()

  // 3. Clear all cached demo data
  queryClient.clear()

  // 4. Navigate to landing page
  navigate('/')
}
