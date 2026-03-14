import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'

export default function FeasibilityWarning({
  totalAllocated,
  netSavings,
}: Readonly<{ totalAllocated: number; netSavings: number }>) {
  if (totalAllocated <= netSavings || netSavings <= 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{
        borderColor: `${rawColors.ios.orange}40`,
        backgroundColor: `${rawColors.ios.orange}08`,
      }}
    >
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: rawColors.ios.orange }} />
      <div className="text-sm">
        <span className="font-medium text-white">Goal allocations exceed savings. </span>
        <span className="text-text-secondary">
          Your goal allocations ({formatCurrencyCompact(totalAllocated)}) exceed your total net savings (
          {formatCurrencyCompact(netSavings)}). Consider adjusting your goals or increasing savings.
        </span>
      </div>
    </motion.div>
  )
}
