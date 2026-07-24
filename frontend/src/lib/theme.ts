/**
 * Theme handling. Two modes:
 *  - 'dark'  -> dark ledger workspace
 *  - 'light' -> light ledger workspace
 *
 * New users default to their OS `prefers-color-scheme`; once they toggle,
 * the explicit choice persists in localStorage under `ledger-sync-theme`.
 *
 * The resolved theme is written to `data-theme` on <html>; index.css defines
 * `[data-theme='light']` token overrides. An inline script in index.html
 * applies it before first paint (no flash); this module keeps it in sync at
 * runtime.
 */

import { refreshRawColors } from '@/constants/colors'

export type ThemeMode = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'ledger-sync-theme'

/** OS-level preference, used as the default for users with no stored choice. */
export function osPreferredTheme(): ThemeMode {
  const prefersLight =
    globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ?? false
  return prefersLight ? 'light' : 'dark'
}

/**
 * Read the stored mode. An explicit stored choice wins; anything else
 * (no value, or the legacy 'system' value from before that mode was removed)
 * falls back to the OS preference.
 */
export function getStoredThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    // localStorage may be unavailable (private mode / quota) -- fall through.
  }
  return osPreferredTheme()
}

/** Resolve a mode to the concrete theme to paint. Identity now that 'system' is gone. */
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  return mode
}

// Tracks the pending removal of the `theme-transition` class so rapid toggles
// don't leave it on (or fight each other).
let transitionTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Apply a resolved theme to the document root.
 *
 * When the theme actually CHANGES, add a short-lived `theme-transition` class
 * that gives every element one uniform color/background/border transition, so
 * the whole UI cross-fades in sync instead of different parts (cards, body,
 * borders) easing at their own speeds. The class is removed after the window
 * so normal hover/focus transitions keep their own (faster) timings.
 *
 * `skipTransition` (used for the very first apply on load) avoids animating the
 * initial paint.
 */
export function applyTheme(resolved: 'dark' | 'light', skipTransition = false): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const changed = root.dataset.theme !== resolved

  if (changed && !skipTransition) {
    root.classList.add('theme-transition')
    if (transitionTimer) clearTimeout(transitionTimer)
    transitionTimer = setTimeout(() => {
      root.classList.remove('theme-transition')
    }, 400)
  }

  root.dataset.theme = resolved

  // Keep the mobile browser chrome (theme-color / color-scheme) tracking the
  // active theme on a live toggle, mirroring the pre-paint script in index.html.
  // Values match the --color-background tokens in index.css.
  const bar = resolved === 'light' ? '#eaf0f7' : '#0a0f16'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar)
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolved)

  // Re-resolve the chart color tokens (Recharts/SVG read concrete values, not
  // var()) so charts repaint with the active theme's palette. Runs after the
  // data-theme switch so getComputedStyle sees the new token values.
  refreshRawColors()
}

/** Persist the mode and apply it immediately. Returns the resolved theme. */
export function setThemeMode(mode: ThemeMode): 'dark' | 'light' {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // ignore persistence failure; still apply for this session
  }
  const resolved = resolveTheme(mode)
  applyTheme(resolved)
  return resolved
}
