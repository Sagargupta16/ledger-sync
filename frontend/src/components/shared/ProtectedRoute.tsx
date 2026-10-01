/**
 * Protected Route Component
 *
 * Wraps routes that require authentication.
 * Redirects to login if user is not authenticated.
 */

import { Navigate, useLocation } from 'react-router'
import Spinner from '@/components/ui/Spinner'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  readonly children: React.ReactNode
}

export function ProtectedRoute({ children }: Readonly<ProtectedRouteProps>) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)
  const location = useLocation()

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Spinner size="md" label="Loading..." />
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Save the attempted URL for redirecting after login
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}
