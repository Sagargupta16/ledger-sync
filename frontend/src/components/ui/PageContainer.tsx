import type { ReactNode } from 'react'

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
 * Section spacing is fixed at `space-y-6 md:space-y-8` to match the existing
 * majority; pass `className` for the rare page that needs a different gap.
 */
interface PageContainerProps {
  readonly children: ReactNode
  /** Extra classes applied to the centered inner wrapper. */
  readonly className?: string
}

export default function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className={cn('max-w-7xl mx-auto space-y-6 md:space-y-8', className)}>
        {children}
      </div>
    </div>
  )
}
