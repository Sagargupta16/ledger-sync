/**
 * CollapsibleSection
 *
 * A reusable collapsible section with premium design system styling,
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
    <div className="bg-white/[0.04] rounded-2xl border border-border">
      {/* Header button */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-3 w-full px-6 py-4 text-left hover:bg-white/[0.06] transition-colors duration-150 rounded-2xl"
      >
        <Icon className="w-5 h-5 text-zinc-400 shrink-0" />
        <span className="text-base font-semibold text-zinc-200 flex-1">{title}</span>
        {badge !== undefined && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/15 text-blue-400">
            {badge}
          </span>
        )}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-zinc-500 transition-transform duration-150',
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
            <div className="px-6 pb-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
