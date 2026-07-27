import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { TriangleAlert, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

import { ROUTES } from '@/constants'
import { useDataHealthQuery } from '@/hooks/api/useDataHealthQuery'

/**
 * App-wide warning that the numbers on screen are from a previous import.
 *
 * Every analytics page reads pre-aggregated rollup tables rather than raw
 * transactions. `upload.py` deliberately does NOT fail an upload when the
 * post-import recompute blows up -- the rows are already committed and a Neon
 * statement timeout must never reject good data -- so the app can serve the
 * previous import's figures indefinitely with nothing on screen to say so. On the
 * real local ledger that ran for 22 days: July expenses displayed 74,523.22
 * against a true 107,651.65, understated by 33,128.43 (44%).
 *
 * It lives in the shell rather than on the Data Health page alone because the
 * user who is being misled is the one reading Dashboard or Budgets. Someone
 * looking at a wrong total has no reason to go looking for a diagnostics page.
 */
export default function StaleAnalyticsAlert() {
  const { data } = useDataHealthQuery()
  const [dismissed, setDismissed] = useState(false)
  const location = useLocation()

  // Data Health carries its own, richer version of this warning plus the fix
  // button, so a second copy stacked above it would be noise.
  const onDataHealthPage = location.pathname === ROUTES.DATA_HEALTH

  // `=== true` on purpose: the frontend and backend deploy independently, so a
  // newer client can meet an API that omits the field. `undefined` means "not
  // reported", which must not render a warning about a condition nobody checked.
  const isStale = data?.rollups_stale === true

  return (
    <AnimatePresence>
      {isStale && !dismissed && !onDataHealthPage && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          role="alert"
          className="flex items-center gap-2.5 border-b border-app-red/40 bg-app-red/10 px-4 py-2"
        >
          <TriangleAlert className="size-4 shrink-0 text-app-red" aria-hidden />
          <p className="min-w-0 flex-1 text-xs leading-5 text-foreground">
            <span className="font-medium">These figures are out of date.</span> Your last import did
            not finish recomputing, so every page is showing the previous import&apos;s numbers.
          </p>
          <Link
            to={ROUTES.DATA_HEALTH}
            /*
              min-h-11 (44px) on phones, dense on desktop. The global touch-target
              rule in index.css covers button/[role=button]/[role=tab] but NOT
              anchors, so a button-styled Link has to opt in the way
              CreditCardHealth's does -- this one measured 32px at 375px.
            */
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-app-red/50 px-2.5 text-xs font-medium text-app-red transition-colors duration-150 hover:bg-app-red/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:min-h-8"
          >
            Fix this
          </Link>
          {/*
            Dismiss is component-local state, not persisted. The condition is
            live: it clears the moment the rollups catch up, and it comes back on
            the next reload while they are still behind. Persisting a dismissal
            would let a user permanently silence a warning that their money
            figures are wrong.
          */}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss out-of-date warning"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 hover:bg-[var(--overlay-2)] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
