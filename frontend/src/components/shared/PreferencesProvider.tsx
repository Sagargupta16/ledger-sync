/**
 * Preferences Provider
 *
 * Loads user preferences on app startup and hydrates the preferences store.
 * This ensures formatters and other components have access to preferences.
 */

import { useEffect } from 'react'
import { usePreferences } from '@/hooks/api/usePreferences'

interface PreferencesProviderProps {
  children: React.ReactNode
}

export function PreferencesProvider({ children }: PreferencesProviderProps) {
  // This hook automatically loads preferences and hydrates the store
  const { isLoading, isError } = usePreferences()

  // Log any errors but don't block the app
  useEffect(() => {
    if (isError) {
      console.warn('Failed to load user preferences, using defaults')
    }
  }, [isError])

  // Optionally show a loading state, but for preferences we just render children
  // to avoid blocking the entire app
  if (isLoading) {
    // Return children anyway - the store has defaults that will work
    return <>{children}</>
  }

  return <>{children}</>
}
