import type { LucideIcon } from 'lucide-react'

interface SidebarGroupProps {
  title: string
  icon: LucideIcon
  isCollapsed?: boolean
  children: React.ReactNode
}

export default function SidebarGroup({ title, icon: Icon, isCollapsed, children }: SidebarGroupProps) {
  if (isCollapsed) {
    return (
      <div className="space-y-1 mb-4">
        <div className="flex items-center justify-center p-2.5 text-[#636366] hover:text-[#98989f] transition-colors rounded-xl hover:bg-white/[0.04]">
          <Icon size={20} />
        </div>
        <div className="space-y-0.5">{children}</div>
      </div>
    )
  }

  return (
    <div className="mb-4">
      {/* iOS-style Section Header */}
      <div className="px-3 py-2 mb-1">
        <span className="text-[11px] font-semibold text-[#636366] uppercase tracking-wider">{title}</span>
      </div>
      
      {/* iOS-style grouped items container */}
      <div className="space-y-0.5 rounded-xl bg-white/[0.04] p-1">
        {children}
      </div>
    </div>
  )
}
