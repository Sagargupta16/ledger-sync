import { useSyncExternalStore } from 'react'

let printing = false
const listeners = new Set<() => void>()

function setPrinting(next: boolean) {
  printing = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  if (listeners.size === 0 && globalThis.window !== undefined) {
    globalThis.addEventListener('beforeprint', onBeforePrint)
    globalThis.addEventListener('afterprint', onAfterPrint)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && globalThis.window !== undefined) {
      globalThis.removeEventListener('beforeprint', onBeforePrint)
      globalThis.removeEventListener('afterprint', onAfterPrint)
    }
  }
}

const onBeforePrint = () => setPrinting(true)
const onAfterPrint = () => setPrinting(false)

/** True while the page prints, so charts never scrolled into view still paint on paper. */
export function usePrinting(): boolean {
  return useSyncExternalStore(subscribe, () => printing, () => false)
}
