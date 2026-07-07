import { useEffect, type RefObject } from 'react'

/**
 * Close a popover/dropdown on outside click or Escape.
 *
 * Attaches document-level listeners only while `open` is true. `onClose`
 * should be a stable setter (e.g. `() => setOpen(false)`); it is re-read
 * per effect run so an inline arrow is fine.
 */
export function useDismissable(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref is stable; onClose intentionally re-read
  }, [open])
}
