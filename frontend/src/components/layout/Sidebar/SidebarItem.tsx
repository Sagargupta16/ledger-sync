import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

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
          'relative flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150 lg:min-h-9',
          isActive
            ? 'bg-[var(--overlay-4)] font-medium text-foreground'
            : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'size-4 shrink-0',
              isActive ? 'text-foreground' : 'text-text-tertiary',
            )}
          />
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span
              className={cn(
                'min-w-5 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums',
                badgeVariant === 'alert'
                  ? 'bg-app-red/10 text-app-red'
                  : 'bg-app-green/10 text-app-green',
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
