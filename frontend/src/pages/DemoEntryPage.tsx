import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { isDemoMode } from '@/store/demoStore'
import { ROUTES } from '@/constants'
import { enterDemoMode } from '@/lib/demo'

/**
 * /demo entry point — enables direct-link sharing.
 * Enters demo mode on mount and redirects to dashboard.
 */
export default function DemoEntryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    // Already logged in as real user — go to dashboard
    if (isAuthenticated && !isDemoMode()) {
      navigate(ROUTES.DASHBOARD, { replace: true })
      return
    }

    // Already in demo mode — go to dashboard
    if (isDemoMode()) {
      navigate(ROUTES.DASHBOARD, { replace: true })
      return
    }

    enterDemoMode(queryClient, navigate)
  }, [isAuthenticated, queryClient, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black" aria-label="Entering demo mode">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading demo...</span>
      </div>
    </div>
  )
}
