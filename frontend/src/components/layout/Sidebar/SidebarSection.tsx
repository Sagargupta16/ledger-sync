interface SidebarSectionProps {
  title: string
  children: React.ReactNode
}

export default function SidebarSection({
  title,
  children,
}: Readonly<SidebarSectionProps>) {
  return (
    <div className="mt-6">
      <div className="px-3 mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-quaternary">
          {title}
        </span>
      </div>
      <div className="space-y-0.5 px-2">
        {children}
      </div>
    </div>
  )
}
