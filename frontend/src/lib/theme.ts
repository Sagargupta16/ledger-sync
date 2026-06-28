/**
 * Theme handling. Three modes:
 *  - 'dark'   -> always dark (the app's original design)
 *  - 'light'  -> always the premium light theme
 *  - 'system' -> follow the OS `prefers-color-scheme`
 *
 * The resolved theme is written to `data-theme` on <html>; index.css defines
 * `[data-theme='light']` token overrides. The setting persists in localStorage
 * under `ledger-sync-theme`. An inline script in index.html applies it before
 * first paint (no flash); this module keeps it in sync at runtime.
 */

export type ThemeMode = 'dark' | 'light' | 'system'

export const THEME_STORAGE_KEY = 'ledger-sync-theme'

/** Read the stored mode, defaulting to 'dark' (the app's historical default). */
export function getStoredThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    // localStorage may be unavailable (private mode / quota) -- fall through.
  }
  return 'dark'
}

/** Resolve a mode to the concrete theme to paint ('dark' | 'light'). */
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    const prefersLight =
      globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ?? false
    return prefersLight ? 'light' : 'dark'
  }
  return mode
}

/** Apply a resolved theme to the document root. */
export function applyTheme(resolved: 'dark' | 'light'): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolved)
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
