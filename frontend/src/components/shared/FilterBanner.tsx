import { Filter, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface FilterBannerProps {
  /** The active filter value, or ``null`` when no filter applied. */
  readonly value: string | null
  /** Display label for the filter dimension (e.g. "Category", "Merchant"). */
  readonly label?: string
  /** Called when the user clicks the clear button. */
  readonly onClear: () => void
}

/**
 * Tiny banner that appears at the top of a page when a filter is active
 * (e.g. user landed via a deep link like ``/spending?category=Food``).
 *
 * Renders nothing when no filter is active so callsites can drop it in
 * unconditionally without adding their own visibility check.
 */
export function FilterBanner({ value, label = 'Category', onClear }: FilterBannerProps) {
  return (
    <AnimatePresence>
      {value && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-app-blue/10 border border-app-blue/30"
          role="status"
        >
          <Filter className="w-4 h-4 text-app-blue shrink-0" aria-hidden />
          <p className="text-sm text-white flex-1 truncate">
            <span className="text-text-tertiary">{label}:</span>{' '}
            <span className="font-medium">{value}</span>
          </p>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-app-blue hover:bg-app-blue/15 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/40"
            aria-label="Clear filter"
          >
            <X className="w-3 h-3" aria-hidden />
            Clear
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
