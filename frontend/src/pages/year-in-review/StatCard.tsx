import { motion } from 'framer-motion'

export interface StatCardProps {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
}

export default function StatCard({ label, value, icon: Icon, color }: Readonly<StatCardProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-5"
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${color}22` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-xl font-bold" style={{ color }}>{value}</p>
        </div>
      </div>
    </motion.div>
  )
}
