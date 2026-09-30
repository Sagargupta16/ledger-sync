import { motion } from 'motion/react'
import { AlertTriangle } from 'lucide-react'
import { formatCurrencyCompact } from '@/lib/formatters'

export default function FeasibilityWarning({
  totalAllocated,
  netSavings,
}: Readonly<{ totalAllocated: number; netSavings: number }>) {
  if (totalAllocated <= netSavings || netSavings <= 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-lg border border-app-orange/25 bg-app-orange/[0.03] px-4 py-3"
      role="alert"
    >
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-app-orange" />
      <div className="text-sm">
        <span className="font-medium text-foreground">Goal allocations exceed savings. </span>
        <span className="text-text-secondary">
          Your goal allocations ({formatCurrencyCompact(totalAllocated)}) exceed your total net savings (
          {formatCurrencyCompact(netSavings)}). Consider adjusting your goals or increasing savings.
        </span>
      </div>
    </motion.div>
  )
}
