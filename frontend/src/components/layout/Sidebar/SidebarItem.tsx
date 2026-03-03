import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SidebarItemProps {
  to: string
  icon: LucideIcon
  label: string
  badge?: number
  badgeVariant?: 'default' | 'alert'
  onNavigate?: () => void
}

export default function SidebarItem({
  to,
  icon: Icon,
  label,
  badge,
  badgeVariant = 'default',
  onNavigate,
}: Readonly<SidebarItemProps>) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 text-sm rounded-lg relative',
          'transition-all duration-150 ease-out',
          isActive
            ? 'bg-white/[0.08] text-white font-medium'
            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Subtle left accent bar */}
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full bg-blue-400" />
          )}
          <Icon
            size={18}
            className={cn(
              'flex-shrink-0 transition-colors duration-150',
              isActive ? 'text-blue-400' : 'text-zinc-500',
            )}
          />
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span
              className={cn(
                'px-1.5 py-0.5 min-w-[20px] text-center text-[11px] font-semibold rounded-md flex-shrink-0',
                badgeVariant === 'alert'
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-white/[0.08] text-zinc-400',
              )}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}
