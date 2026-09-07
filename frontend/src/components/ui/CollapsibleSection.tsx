/**
 * CollapsibleSection
 *
 * A reusable collapsible section with premium design system styling,
 * animated expand/collapse via motion, and an optional badge pill.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
import { cn } from '@/lib/cn'

interface CollapsibleSectionProps {
  readonly title: string
  readonly icon: React.ElementType
  readonly defaultExpanded?: boolean
  readonly badge?: string | number
  readonly children: React.ReactNode
}

export default function CollapsibleSection({
  title,
  icon: Icon,
  defaultExpanded = true,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded)

  return (
    <motion.div layout className="ledger-panel relative overflow-hidden">
      {/* Header button */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[var(--overlay-2)] sm:px-5"
      >
        <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
        <span className="text-base font-semibold text-foreground flex-1">{title}</span>
        {badge !== undefined && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-app-blue/15 text-app-blue">
            {badge}
          </span>
        )}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-text-tertiary transition-transform duration-200',
            !expanded && '-rotate-90',
          )}
        />
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false} mode="popLayout">
        {expanded && (
          <motion.div
            {...DISCLOSURE_TRANSITION}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--hairline-1)] px-4 py-4 sm:px-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
