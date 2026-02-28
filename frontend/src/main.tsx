import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ── Suppress harmless third-party console warnings ──────────────────────────
// Recharts: "width(-1) and height(-1) should be greater than 0" fires during
//   initial layout when ResponsiveContainer momentarily has zero dimensions.
//   Charts render correctly once layout resolves.
// Framer Motion: "Reduced Motion enabled" fires on devices with that OS setting.
//   We've removed our own reduced-motion overrides; this is framer's own warning.
const _origWarn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string') {
    if (args[0].includes('should be greater than 0')) return
    if (args[0].includes('Reduced Motion')) return
  }
  _origWarn(...args)
}

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
