import type { ReactNode } from 'react'

import { motion } from 'framer-motion'

import { PAGE_ENTER } from '@/constants/animations'
import { cn } from '@/lib/cn'

/**
 * Canonical page scaffold for every analytics/feature page.
 *
 * Before this, page roots diverged three ways: some used
 * `min-h-dvh p-4 md:p-6 lg:p-8` + a centered `max-w-7xl mx-auto` inner wrapper,
 * others dropped the centering entirely (goals / year-in-review / comparison
 * went full-bleed on wide screens, causing a width jump when navigating).
 *
 * `PageContainer` collapses that to one root:
 *   - outer: `min-h-dvh` + responsive page padding
 *   - inner: centered `max-w-7xl` + consistent vertical section rhythm
 *
 * Horizontal padding mirrors `PageHeader` exactly --
 * `px-[max(<design>,env(safe-area-inset-left))]` -- so a sticky `PageHeader`'s
 * `-mx-4 md:-mx-6 lg:-mx-8` edge-bleed cancels this padding and the header
 * background lines up with the content on a notched iOS PWA (portrait or
 * landscape). Vertical padding stays `py-4 md:py-6 lg:py-8`.
 *
 * Section spacing is fixed at `space-y-6 md:space-y-8` to match the existing
 * majority; pass `className` for the rare page that needs a different gap.
 *
 * `maxWidth` defaults to `7xl` (the analytics-page norm). Pages that read best
 * narrower -- Settings / Upload -- pass `5xl` so they can adopt this scaffold
 * without widening their content column.
 *
 * The inner wrapper carries the shared page-entrance motion (PAGE_ENTER), so
 * every page fades up on navigation without per-page wiring.
 */
type MaxWidth = '7xl' | '5xl' | '4xl'

const MAX_WIDTH_CLASSES: Record<MaxWidth, string> = {
  '7xl': 'max-w-7xl',
  '5xl': 'max-w-5xl',
  '4xl': 'max-w-4xl',
}

interface PageContainerProps {
  readonly children: ReactNode
  /** Extra classes applied to the centered inner wrapper. */
  readonly className?: string
  /** Centered content max width. Defaults to `7xl`. */
  readonly maxWidth?: MaxWidth
}

export default function PageContainer({ children, className, maxWidth = '7xl' }: PageContainerProps) {
  return (
    <div className="min-h-full px-[max(1rem,env(safe-area-inset-left))] py-5 md:px-[max(1.5rem,env(safe-area-inset-left))] md:py-6 lg:px-[max(2rem,env(safe-area-inset-left))]">
      <motion.div
        {...PAGE_ENTER}
        className={cn(MAX_WIDTH_CLASSES[maxWidth], 'mx-auto space-y-5 md:space-y-6', className)}
      >
        {children}
      </motion.div>
    </div>
  )
}
