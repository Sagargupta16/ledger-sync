import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { isDemoMode } from '@/store/demoStore'
import { ROUTES } from '@/constants'
import { enterDemoMode } from '@/lib/demo'
import { Spinner } from '@/components/ui'

/**
 * /demo entry point — enables direct-link sharing.
 * Enters demo mode on mount and redirects to dashboard.
 */
export default function DemoEntryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    // `void navigate(...)`: typed `void | Promise<void>` by react-router but
    // returns undefined under BrowserRouter (App.tsx), and nothing here waits
    // on the transition.
    // Already logged in as real user — go to dashboard
    if (isAuthenticated && !isDemoMode()) {
      void navigate(ROUTES.DASHBOARD, { replace: true })
      return
    }

    // Already in demo mode — go to dashboard
    if (isDemoMode()) {
      void navigate(ROUTES.DASHBOARD, { replace: true })
      return
    }

    enterDemoMode(queryClient, navigate)
  }, [isAuthenticated, queryClient, navigate])

  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background px-4"
      aria-label="Entering demo mode"
    >
      <Spinner size="lg" label="Preparing demo workspace" />
    </main>
  )
}
