import { create } from 'zustand'

export type MotionMode = 'full' | 'reduced'

export const MOTION_STORAGE_KEY = 'ledger-sync-motion'

function readStoredMotionMode(): MotionMode {
  try {
    return globalThis.localStorage?.getItem(MOTION_STORAGE_KEY) === 'reduced'
      ? 'reduced'
      : 'full'
  } catch {
    return 'full'
  }
}

function applyMotionMode(mode: MotionMode) {
  if (globalThis.document) {
    globalThis.document.documentElement.dataset.motion = mode
  }
}

interface MotionState {
  mode: MotionMode
  setMode: (mode: MotionMode) => void
  syncMode: () => void
}

const initialMode = readStoredMotionMode()
applyMotionMode(initialMode)

export const useMotionStore = create<MotionState>((set, get) => ({
  mode: initialMode,
  setMode: (mode) => {
    applyMotionMode(mode)
    try {
      globalThis.localStorage?.setItem(MOTION_STORAGE_KEY, mode)
    } catch {
      // The in-memory setting still works when storage is unavailable.
    }
    set({ mode })
  },
  syncMode: () => applyMotionMode(get().mode),
}))

export function isMotionReduced(): boolean {
  return useMotionStore.getState().mode === 'reduced'
}
