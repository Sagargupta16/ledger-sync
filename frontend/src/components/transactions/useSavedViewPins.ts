import { toast } from 'sonner'

import { usePinView, useUnpinView, useWatchTiles } from '@/hooks/api/useWatchTiles'
import { useDemoStore } from '@/store/demoStore'

/**
 * Dashboard pin state for the saved-views menu. It reads the Dashboard tiles
 * query once the menu opens, and the Dashboard then reuses that cached answer.
 *
 * `note` says why pins cannot change right now. A blocked pin is never
 * `disabled`: it stays focusable, the note describes it, and a tap toasts the
 * note (or retries a failed load), because a disabled button's tooltip and
 * focus reach nobody.
 */
export function useSavedViewPins(open: boolean) {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const tilesQuery = useWatchTiles({ enabled: open })
  const pinView = usePinView()
  const unpinView = useUnpinView()

  const data = tilesQuery.data
  const pinnedIds = new Set((data?.tiles ?? []).map((tile) => tile.view_id))
  const maxPins = data?.max_pins ?? 0
  const atLimit = maxPins > 0 && pinnedIds.size >= maxPins
  const loadFailed = !data && tilesQuery.isError
  // Taps wait for the pins, and after a write for the refetch that carries its
  // result, so a quick second tap never toggles from the state before it.
  const busy = !data || tilesQuery.isFetching || pinView.isPending || unpinView.isPending

  let note: string | null = null
  if (isDemoMode) note = 'Demo mode is read-only; pinning needs your own account.'
  else if (loadFailed) note = 'Dashboard pins could not load. Tap a pin to try again.'
  else if (atLimit) note = `${maxPins} of ${maxPins} views are pinned. Unpin one to pin another.`

  /** True when `note` is why this pin cannot change. */
  const isBlocked = (pinned: boolean) => isDemoMode || loadFailed || (atLimit && !pinned)

  // A failed pin toasts the server's reason (such as the pin limit) globally.
  const toggle = (viewId: number, pinned: boolean) => {
    if (loadFailed) {
      if (!tilesQuery.isFetching) void tilesQuery.refetch()
      return
    }
    if (isBlocked(pinned)) {
      if (note) toast.info(note)
      return
    }
    // While busy the new state is a moment away; a tap now would act on the old one.
    if (busy) return
    if (pinned) {
      unpinView.mutate(viewId, { onSuccess: () => toast.success('Unpinned from the Dashboard') })
    } else {
      pinView.mutate(viewId, { onSuccess: () => toast.success('Pinned to the Dashboard') })
    }
  }

  return { pinnedIds, note, busy, isBlocked, toggle }
}
