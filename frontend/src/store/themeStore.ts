/**
 * Theme store -- single source of truth for the active theme mode.
 *
 * Holds the user's chosen `mode` ('dark' | 'light') and the `resolved`
 * concrete theme. Setting the mode persists it and applies `data-theme` to
 * <html> via the theme lib. New users default to the OS preference (resolved
 * once at load); the toggle stores an explicit choice.
 */

import { create } from 'zustand'

import {
  type ThemeMode,
  getStoredThemeMode,
  resolveTheme,
  applyTheme,
  setThemeMode as persistThemeMode,
} from '@/lib/theme'

interface ThemeState {
  mode: ThemeMode
  resolved: 'dark' | 'light'
  setMode: (mode: ThemeMode) => void
  /** Re-resolve from the current mode (used when the OS preference changes). */
  syncResolved: () => void
}

const initialMode = getStoredThemeMode()

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  resolved: resolveTheme(initialMode),
  setMode: (mode) => {
    const resolved = persistThemeMode(mode)
    set({ mode, resolved })
  },
  syncResolved: () => {
    const resolved = resolveTheme(get().mode)
    applyTheme(resolved)
    set({ resolved })
  },
}))
