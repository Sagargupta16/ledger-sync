import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface DemoState {
  isDemoMode: boolean
  enterDemo: () => void
  exitDemo: () => void
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      isDemoMode: false,
      enterDemo: () => set({ isDemoMode: true }),
      exitDemo: () => set({ isDemoMode: false }),
    }),
    {
      name: 'ledger-sync-demo',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)

/** Standalone getter for non-React contexts (Axios interceptors, etc.) */
export const isDemoMode = () => useDemoStore.getState().isDemoMode
