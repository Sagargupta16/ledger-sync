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
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
          'transition-all duration-150 ease-out',
          isActive
            ? 'bg-[var(--overlay-4)] text-foreground font-medium shadow-[inset_0_0_0_1px_var(--hairline-2)]'
            : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Subtle left accent bar */}
          {isActive && (
            <div className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-app-blue" />
          )}
          <Icon
            size={18}
            className={cn(
              'flex-shrink-0 transition-colors duration-150',
              isActive ? 'text-app-blue' : 'text-text-tertiary',
            )}
          />
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span
              className={cn(
              'min-w-[20px] flex-shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums',
                badgeVariant === 'alert'
                  ? 'bg-app-red/15 text-app-red'
                  : 'bg-[var(--overlay-4)] text-muted-foreground',
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
