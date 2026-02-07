/**
 * Preferences Provider
 *
 * Loads user preferences on app startup and hydrates the preferences store.
 * This ensures formatters and other components have access to preferences.
 */

import { usePreferences } from '@/hooks/api/usePreferences'

interface PreferencesProviderProps {
  children: React.ReactNode
}

export function PreferencesProvider({ children }: PreferencesProviderProps) {
  // This hook automatically loads preferences and hydrates the store
  const { isLoading, isError } = usePreferences()

  // Render children regardless of loading/error state — the store has defaults
  void isLoading
  void isError

  return <>{children}</>
}
