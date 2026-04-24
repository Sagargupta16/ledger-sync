import { motion } from 'framer-motion'
import { fadeUpWithDelay } from '@/constants/animations'

interface SummaryCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  colorClass: string
  bgClass: string
  shadowClass: string
  delay: number
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  colorClass,
  bgClass,
  shadowClass,
  delay,
}: Readonly<SummaryCardProps>) {
  return (
    <motion.div {...fadeUpWithDelay(delay)} className="glass rounded-2xl border border-border p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 ${bgClass} rounded-xl ${shadowClass}`}>
          <Icon className={`w-5 h-5 ${colorClass}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg sm:text-xl font-bold text-white">{value}</p>
        </div>
      </div>
    </motion.div>
  )
}
