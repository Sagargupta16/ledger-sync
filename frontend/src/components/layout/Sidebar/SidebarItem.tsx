import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { rawColors } from '@/constants/colors'

interface SidebarItemProps {
  to: string
  icon: LucideIcon
  label: string
  isCollapsed?: boolean
}

export default function SidebarItem({ to, icon: Icon, label, isCollapsed }: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all duration-200 group relative',
          isActive
            ? 'bg-white/[0.12] text-white font-medium'
            : 'text-[#98989f] hover:bg-white/[0.06] hover:text-white',
          isCollapsed && 'justify-center px-2'
        )
      }
      title={isCollapsed ? label : undefined}
    >
      {({ isActive }) => (
        <>
          {/* iOS-style active indicator */}
          {isActive && (
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" 
              style={{ backgroundColor: rawColors.ios.blue }}
            />
          )}
          <Icon 
            size={18} 
            className="transition-colors duration-200 flex-shrink-0"
            style={{ 
              color: isActive ? rawColors.ios.blue : rawColors.text.tertiary 
            }}
          />
          {!isCollapsed && (
            <span className="flex-1 truncate">{label}</span>
          )}
        </>
      )}
    </NavLink>
  )
}
