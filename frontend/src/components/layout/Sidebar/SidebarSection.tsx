interface SidebarSectionProps {
  title: string
  children: React.ReactNode
}

export default function SidebarSection({
  title,
  children,
}: Readonly<SidebarSectionProps>) {
  return (
    <div className="mt-4">
      <div className="mb-1 px-3">
        <span className="text-[11px] font-medium text-text-secondary">
          {title}
        </span>
      </div>
      <div className="space-y-0.5 px-2">
        {children}
      </div>
    </div>
  )
}
