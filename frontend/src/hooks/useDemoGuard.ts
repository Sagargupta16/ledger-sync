import { useCallback } from 'react'
import { toast } from 'sonner'
import { useDemoStore } from '@/store/demoStore'

/**
 * Hook for guarding mutations in demo mode.
 * Returns `isDemoMode` flag and a `guardDemoAction` function that
 * shows a toast and returns `true` if the action should be blocked.
 */
export function useDemoGuard() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode)

  const guardDemoAction = useCallback(
    (actionLabel?: string) => {
      if (!isDemoMode) return false
      toast.info(
        actionLabel
          ? `${actionLabel} is disabled in demo mode. Sign up to use your own data!`
          : 'Sign up to save changes!',
        { duration: 3000 },
      )
      return true
    },
    [isDemoMode],
  )

  return { isDemoMode, guardDemoAction }
}
