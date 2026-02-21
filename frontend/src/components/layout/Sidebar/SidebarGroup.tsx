import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { staggerFast } from '@/constants/animations'
import { rawColors } from '@/constants/colors'

interface SidebarGroupProps {
  id: string
  title: string
  groupIcon?: LucideIcon
  isCollapsed?: boolean
  isExpanded?: boolean
  onToggle?: () => void
  isActive?: boolean
  children: React.ReactNode
}

export default function SidebarGroup({
  title,
  groupIcon: GroupIcon,
  isCollapsed,
  isExpanded = true,
  onToggle,
  isActive,
  children,
}: Readonly<SidebarGroupProps>) {
  // Collapsed sidebar — always show items, no group headers
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
      {/* Group Header — clickable to toggle collapse */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 mb-1 rounded-lg transition-colors duration-200',
          'hover:bg-white/5 group/header',
          isActive && 'bg-ios-blue/[0.04]',
        )}
      >
        {GroupIcon && (
          <GroupIcon
            size={14}
            className="flex-shrink-0 transition-colors duration-200"
            style={{ color: isActive ? rawColors.ios.blue : rawColors.text.tertiary }}
          />
        )}
        <span
          className={cn(
            'text-overline font-semibold uppercase tracking-wider flex-1 text-left transition-colors duration-200',
            isActive ? 'text-ios-blue/70' : 'text-text-tertiary',
          )}
        >
          {title}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'transition-transform duration-200 text-text-tertiary',
            'opacity-50 group-hover/header:opacity-100',
            !isExpanded && '-rotate-90',
          )}
        />
      </button>

      {/* Collapsible content with animation */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <motion.div
              variants={staggerFast}
              initial="hidden"
              animate="visible"
              className={cn(
                'space-y-0.5 rounded-xl p-1',
                isActive ? 'bg-white/[0.07]' : 'bg-white/5',
              )}
            >
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
