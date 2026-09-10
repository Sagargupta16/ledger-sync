import type { NavigateFunction } from 'react-router-dom'

import type { QueryClient } from '@tanstack/react-query'

import { endSession } from '@/lib/session'

export function exitDemoMode(queryClient: QueryClient, navigate: NavigateFunction): void {
  endSession(queryClient)

  // Navigate to landing page.
  // See enterDemoMode: NavigateFunction is typed `void | Promise<void>` but
  // returns undefined under BrowserRouter, so `void` is fire-and-forget.
  void navigate('/')
}
