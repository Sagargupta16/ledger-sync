import type { LucideIcon } from 'lucide-react'

interface SidebarGroupProps {
  title: string
  icon: LucideIcon
  isCollapsed: boolean
  children: React.ReactNode
}

export default function SidebarGroup({ title, icon: Icon, isCollapsed, children }: SidebarGroupProps) {
  if (isCollapsed) {
    return (
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-center p-2.5 text-gray-400 hover:text-purple-400 transition-colors rounded-lg hover:bg-purple-500/10">
          <Icon size={20} />
        </div>
        <div className="space-y-1">{children}</div>
      </div>
    )
  }

  return (
    <div className="mb-6">
      {/* Section Header */}
      <div className="px-3 py-2 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-gradient-to-br from-purple-500/15 to-blue-500/15">
            <Icon size={14} className="text-purple-400" />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</span>
        </div>
      </div>
      
      {/* Items Block */}
      <div className="space-y-0.5 ml-1 pl-3 border-l-2 border-purple-500/20">
        {children}
      </div>
    </div>
  )
}
