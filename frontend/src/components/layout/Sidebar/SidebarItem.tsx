import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SidebarItemProps {
  to: string
  icon: LucideIcon
  label: string
  isCollapsed: boolean
}

export default function SidebarItem({ to, icon: Icon, label, isCollapsed }: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isActive
            ? 'bg-primary text-primary-foreground font-medium'
            : 'text-muted-foreground',
          isCollapsed && 'justify-center'
        )
      }
      title={isCollapsed ? label : undefined}
    >
      <Icon size={18} />
      {!isCollapsed && <span>{label}</span>}
    </NavLink>
  )
}
