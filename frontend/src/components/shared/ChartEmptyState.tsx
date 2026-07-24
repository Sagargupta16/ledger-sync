import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'

interface ChartEmptyStateProps {
  readonly message?: string
  readonly height?: number
}

/**
 * Empty state placeholder for charts with no data.
 * Drop this inside a ResponsiveContainer or chart wrapper when data is empty.
 */
export default function ChartEmptyState({
  message = 'No data available for the selected period',
  height = 300,
}: ChartEmptyStateProps) {
  return (
    <output
      aria-label="No data available for this chart"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border"
      style={{ height }}
    >
      <motion.span
        className="p-3 rounded-xl bg-[var(--overlay-2)]"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <BarChart3 className="w-6 h-6 text-text-tertiary" />
      </motion.span>
      <motion.span
        className="text-sm text-text-tertiary"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        {message}
      </motion.span>
    </output>
  )
}
