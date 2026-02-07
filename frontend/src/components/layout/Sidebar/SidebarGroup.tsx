interface SidebarGroupProps {
  title: string
  isCollapsed?: boolean
  children: React.ReactNode
}

export default function SidebarGroup({ title, isCollapsed, children }: Readonly<SidebarGroupProps>) {
  if (isCollapsed) {
    return (
      <div className="py-2 border-b border-white/[0.06] last:border-b-0">
        <div className="space-y-1">{children}</div>
      </div>
    )
  }

  return (
    <div className="py-3 border-b border-white/[0.06] last:border-b-0">
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
