import { useReducedMotion as useFMReducedMotion } from 'framer-motion'

/**
 * Returns true when the user has enabled "Reduce Motion" in their OS settings.
 * Wraps framer-motion's built-in hook for consistent usage across the app.
 */
export function useReducedMotion(): boolean {
  return useFMReducedMotion() ?? false
}
