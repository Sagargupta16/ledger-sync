import type { ReactNode } from 'react'

import { motion } from 'motion/react'

import { inViewReveal } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

interface ChartSectionProps {
  /** Id of the section heading; the section is labelled by it. */
  readonly titleId: string
  /** Mono kicker above the title, e.g. "Wealth / account ledger". */
  readonly eyebrow: string
  readonly title: ReactNode
  readonly description: ReactNode
  /** Control or badge placed after the title block, inside the header row. */
  readonly action?: ReactNode
  /** Header row layout. Defaults to a plain block with bottom spacing. */
  readonly headerClassName?: string
  readonly descriptionClassName?: string
  /** Extra section classes, e.g. `@container`. */
  readonly className?: string
  readonly children: ReactNode
}

/**
 * Panel shell for a full-width chart section: the scroll-in reveal, the
 * eyebrow / title / description header, and an optional control beside it.
 */
export default function ChartSection({
  titleId,
  eyebrow,
  title,
  description,
  action,
  headerClassName = 'mb-5',
  descriptionClassName,
  className,
  children,
}: ChartSectionProps) {
  const motionEnabled = useMotionStore((state) => state.mode === 'full')

  return (
    <motion.section
      className={cn('ledger-panel min-w-0 p-4 sm:p-6', className)}
      aria-labelledby={titleId}
      {...inViewReveal('panel', motionEnabled)}
    >
      <div className={headerClassName}>
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-blue">
            {eyebrow}
          </p>
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className={cn('mt-1 text-xs leading-5 text-muted-foreground', descriptionClassName)}>
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  )
}
