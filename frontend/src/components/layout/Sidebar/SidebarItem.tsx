import { useState, useRef, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { rawColors } from '@/constants/colors'
import { slideInLeftItem } from '@/constants/animations'

interface SidebarItemProps {
  to: string
  icon: LucideIcon
  label: string
  isCollapsed?: boolean
}

export default function SidebarItem({ to, icon: Icon, label, isCollapsed }: Readonly<SidebarItemProps>) {
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const itemRef = useRef<HTMLDivElement>(null)

  const showTooltip = useCallback(() => {
    if (!isCollapsed || !itemRef.current) return
    const rect = itemRef.current.getBoundingClientRect()
    setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 12 })
  }, [isCollapsed])

  const hideTooltip = useCallback(() => setTooltipPos(null), [])

  // Short label for collapsed mode (first word, max 5 chars)
  const shortLabel = label.split(' ')[0].slice(0, 6)

  return (
    <motion.div
      ref={itemRef}
      variants={slideInLeftItem}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors duration-200 group relative',
            isActive
              ? 'bg-gradient-to-r from-ios-blue/15 to-transparent text-white font-medium shadow-lg shadow-ios-blue/5'
              : 'text-muted-foreground hover:bg-white/10 hover:text-white hover:shadow-md hover:shadow-white/5',
            isCollapsed && 'flex-col gap-1 justify-center px-1 py-2 hover:bg-white/10'
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* iOS-style active indicator — animated with layoutId */}
            {isActive && !isCollapsed && (
              <motion.div
                layoutId="sidebarActiveIndicator"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                style={{ backgroundColor: rawColors.ios.blue }}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            <Icon
              size={18}
              className="transition-colors duration-200 flex-shrink-0"
              style={{
                color: isActive ? rawColors.ios.blue : rawColors.text.tertiary
              }}
            />
            {isCollapsed ? (
              <span className={cn(
                "text-caption leading-tight truncate max-w-full text-center",
                isActive ? "text-white" : "text-text-tertiary"
              )}>
                {shortLabel}
              </span>
            ) : (
              <span className="flex-1 truncate">{label}</span>
            )}
          </>
        )}
      </NavLink>

      {/* Fixed-position tooltip — never clipped by parent overflow */}
      {isCollapsed && tooltipPos && (
        <div
          className="fixed px-3 py-1.5 bg-surface-tooltip text-white text-sm font-medium rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none border border-border"
          style={{ top: tooltipPos.top, left: tooltipPos.left, transform: 'translateY(-50%)' }}
        >
          {label}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-surface-tooltip rotate-45 border-l border-b border-border" />
        </div>
      )}
    </motion.div>
  )
}
