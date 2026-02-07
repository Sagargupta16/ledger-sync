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

export default function SidebarItem({ to, icon: Icon, label, isCollapsed }: Readonly<SidebarItemProps>) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all duration-200 group relative',
          isActive
            ? 'bg-white/[0.12] text-white font-medium shadow-lg shadow-white/5'
            : 'text-[#98989f] hover:bg-white/[0.08] hover:text-white hover:shadow-md hover:shadow-white/5',
          isCollapsed && 'justify-center px-2 hover:scale-105 hover:bg-white/[0.12]'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* iOS-style active indicator */}
          {isActive && !isCollapsed && (
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" 
              style={{ backgroundColor: rawColors.ios.blue }}
            />
          )}
          {/* Collapsed active indicator - dot below icon */}
          {isActive && isCollapsed && (
            <div 
              className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" 
              style={{ backgroundColor: rawColors.ios.blue }}
            />
          )}
          <Icon 
            size={isCollapsed ? 20 : 18} 
            className={cn(
              "transition-all duration-200 flex-shrink-0",
              isCollapsed && "group-hover:scale-110"
            )}
            style={{ 
              color: isActive ? rawColors.ios.blue : rawColors.text.tertiary 
            }}
          />
          {!isCollapsed && (
            <span className="flex-1 truncate">{label}</span>
          )}
          {/* Tooltip on hover when collapsed */}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#2c2c2e] text-white text-sm font-medium rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none border border-white/10">
              {label}
              {/* Arrow */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-[#2c2c2e] rotate-45 border-l border-b border-white/10" />
            </div>
          )}
        </>
      )}
    </NavLink>
  )
}
