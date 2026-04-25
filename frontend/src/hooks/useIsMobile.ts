import { useEffect, useState } from 'react'

/**
 * Returns true when the viewport is narrower than the Tailwind `sm` breakpoint (640px).
 * Re-evaluates on resize via `matchMedia`. SSR-safe (returns false on the server).
 *
 * Prefer CSS media queries where possible; only reach for this hook when the decision
 * is driven by JS (e.g. rendering a different component, feeding different props to a
 * third-party chart).
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(
    () => globalThis.window !== undefined && globalThis.window.innerWidth < breakpoint,
  )
  useEffect(() => {
    const mq = globalThis.window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])
  return isMobile
}
