/**
 * Owner stats for the admin page (`services/api/admin.ts`). Only an account the
 * server marks `is_admin` (LEDGER_SYNC_ADMIN_EMAILS) asks for them, never in
 * demo mode, and a 403 is final instead of retried.
 */

import { isAxiosError } from 'axios'
import { useQuery } from '@tanstack/react-query'

import { adminService, type AdminStats } from '@/services/api/admin'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
}

/** The signed-in account is an admin and the app is not in demo mode. */
export function useIsAdmin(): boolean {
  const isAdmin = useAuthStore((state) => state.user?.is_admin === true)
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  return isAdmin && !isDemoMode
}

export function isForbidden(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 403
}

export function useAdminStats() {
  const isAdmin = useIsAdmin()
  return useQuery<AdminStats, Error>({
    queryKey: adminKeys.stats(),
    queryFn: () => adminService.getStats(),
    enabled: isAdmin,
    staleTime: Infinity,
    // One retry for a flaky network, none for a server that says no.
    retry: (failures, error) => !isForbidden(error) && failures < 1,
  })
}
