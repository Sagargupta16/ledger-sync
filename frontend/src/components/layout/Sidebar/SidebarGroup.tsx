import { motion } from 'framer-motion'
import { staggerFast } from '@/constants/animations'

interface SidebarGroupProps {
  title: string
  isCollapsed?: boolean
  children: React.ReactNode
}

export default function SidebarGroup({ title, isCollapsed, children }: Readonly<SidebarGroupProps>) {
  if (isCollapsed) {
    return (
      <div className="py-2 border-b border-border last:border-b-0">
        <motion.div
          variants={staggerFast}
          initial="hidden"
          animate="visible"
          className="space-y-1"
        >
          {children}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="py-3 border-b border-border last:border-b-0">
      {/* iOS-style Section Header */}
      <div className="px-3 py-2 mb-1">
        <span className="text-overline font-semibold text-text-tertiary uppercase tracking-wider">{title}</span>
      </div>

      {/* iOS-style grouped items container */}
      <motion.div
        variants={staggerFast}
        initial="hidden"
        animate="visible"
        className="space-y-0.5 rounded-xl bg-white/5 p-1"
      >
        {children}
      </motion.div>
    </div>
  )
}
