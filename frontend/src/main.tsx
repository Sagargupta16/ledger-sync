import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
// After index.css: intentional !important overrides (theme fade, Reduced motion, print).
import './styles/overrides.css'
import App from './App.tsx'

// ── Suppress known harmless third-party console warnings (production only) ───
// These are noise from upstream libraries that cannot be fixed on our side.
// - Motion: Reduced motion accessibility notification
if (import.meta.env.PROD) {
  const SUPPRESSED_PATTERNS = [
    'Reduced Motion',            // Motion a11y
  ]
  const _origWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : ''
    if (SUPPRESSED_PATTERNS.some((p) => msg.includes(p))) return
    _origWarn(...args)
  }
}

// ── Recover when a deploy replaced the lazy page chunks ───────────────────────
// A tab, or the installed app's first launch after a deploy, can still run the
// previous build while the new service worker has already deleted its chunks,
// so the next lazy page 404s. Reload once to pick up the current build. A second
// failure within a minute falls through to ChunkErrorBoundary's Reload screen.
const CHUNK_RELOAD_KEY = 'ledger-sync-chunk-reload-at'
globalThis.addEventListener('vite:preloadError', (event) => {
  const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
  if (Date.now() - lastReload < 60_000) return
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  event.preventDefault()
  globalThis.location.reload()
})

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} else {
  console.error(
    '[ledger-sync] Could not find #root element. The application cannot mount.'
  )
}
