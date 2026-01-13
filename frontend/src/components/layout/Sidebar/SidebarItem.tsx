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
          'flex items-center gap-3 px-4 py-2.5 text-sm rounded-xl transition-all duration-200 group relative',
          'hover:bg-gradient-to-r hover:from-purple-500/20 hover:to-blue-500/20',
          'hover:shadow-lg hover:shadow-purple-500/10 hover:translate-x-1',
          isActive
            ? 'bg-gradient-to-r from-purple-500/30 to-blue-500/30 text-white font-medium shadow-lg shadow-purple-500/20 border border-purple-500/30'
            : 'text-gray-400 hover:text-white border border-transparent',
          isCollapsed && 'justify-center px-2'
        )
      }
      title={isCollapsed ? label : undefined}
    >
      {isActive => (
        <>
          <Icon size={18} className={cn(
            'transition-all duration-200',
            isActive ? 'text-purple-300' : 'text-gray-500 group-hover:text-purple-400'
          )} />
          {!isCollapsed && (
            <>
              <span className="flex-1">{label}</span>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></div>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  )
}
