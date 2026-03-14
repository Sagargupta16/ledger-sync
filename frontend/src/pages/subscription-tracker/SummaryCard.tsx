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
    <motion.div {...fadeUpWithDelay(delay)} className="glass rounded-xl border border-border p-6 shadow-lg">
      <div className="flex items-center gap-3">
        <div className={`p-3 ${bgClass} rounded-xl shadow-lg ${shadowClass}`}>
          <Icon className={`w-6 h-6 ${colorClass}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    </motion.div>
  )
}
