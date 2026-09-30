export interface InsightRowProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  subtitle?: string
  /** CSS color for the icon and its tint; a `colors.*` var() follows the theme. */
  color: string
}

export default function InsightRow({ icon: Icon, label, value, subtitle, color }: Readonly<InsightRowProps>) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-tertiary">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <p className="text-sm font-semibold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-text-tertiary">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
