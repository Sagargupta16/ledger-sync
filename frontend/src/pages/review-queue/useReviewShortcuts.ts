import { useEffect } from 'react'

import { isTypingTarget } from './reviewQueueUtils'

interface ReviewShortcuts {
  /** Off while the category picker is open, so its own keys stay its own. */
  readonly enabled: boolean
  readonly canDecide: boolean
  readonly keep: () => void
  readonly openPicker: () => void
  readonly undo: () => void
}

/** K keeps, C opens the category picker, U undoes. Plain keys only, never while typing. */
export function useReviewShortcuts({ enabled, canDecide, keep, openPicker, undo }: ReviewShortcuts) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'u') undo()
      else if (key === 'k' && canDecide) keep()
      else if (key === 'c' && canDecide) openPicker()
      else return
      event.preventDefault()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled, canDecide, keep, openPicker, undo])
}
