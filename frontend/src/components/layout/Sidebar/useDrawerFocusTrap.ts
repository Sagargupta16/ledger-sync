import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus trap for the mobile navigation drawer: focuses the first control on
 * open, closes on Escape, and keeps Tab / Shift+Tab cycling between the menu
 * toggle and the drawer's controls. Inactive while `active` is false (drawer
 * closed, or another dialog such as the profile modal owns focus).
 */
export function useDrawerFocusTrap(
  active: boolean,
  drawerRef: RefObject<HTMLElement | null>,
  toggleRef: RefObject<HTMLButtonElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!active) return

    const drawer = drawerRef.current
    drawer?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !drawer) return

      const focusable = [
        toggleRef.current,
        ...drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ].filter((element): element is HTMLElement => element !== null)
      const first = focusable[0]
      const last = focusable.at(-1)

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active, drawerRef, toggleRef, onClose])
}
