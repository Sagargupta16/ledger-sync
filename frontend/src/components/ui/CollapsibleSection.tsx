/**
 * CollapsibleSection
 *
 * A reusable collapsible section with glass-card styling,
 * animated expand/collapse via framer-motion, and an optional badge pill.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
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
    <div className="glass rounded-lg border border-border">
      {/* Header button */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-3 w-full px-5 py-4 text-left hover:bg-white/5 transition-colors rounded-lg"
      >
        <Icon className="w-5 h-5 text-primary shrink-0" />
        <span className="text-base font-semibold text-white flex-1">{title}</span>
        {badge !== undefined && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/20 text-primary">
            {badge}
          </span>
        )}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-200',
            !expanded && '-rotate-90',
          )}
        />
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
