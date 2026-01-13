import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SidebarGroupProps {
  title: string
  icon: LucideIcon
  isCollapsed: boolean
  children: React.ReactNode
}

export default function SidebarGroup({ title, icon: Icon, isCollapsed, children }: SidebarGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  if (isCollapsed) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-center p-2 text-muted-foreground">
          <Icon size={20} />
        </div>
        {isExpanded && <div className="space-y-1">{children}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg',
          'hover:bg-accent hover:text-accent-foreground transition-colors',
          'text-muted-foreground'
        )}
      >
        <div className="flex items-center gap-2">
          <Icon size={18} />
          <span>{title}</span>
        </div>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {isExpanded && <div className="ml-4 space-y-1">{children}</div>}
    </div>
  )
}
