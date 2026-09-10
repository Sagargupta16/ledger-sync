interface ChartSeriesLegendProps {
  readonly items: readonly {
    key: string
    label: string
    color: string
    value?: string
  }[]
  readonly caption?: string
}

/** Keep series names and current readings outside the plot's measuring area. */
export default function ChartSeriesLegend({ items, caption }: ChartSeriesLegendProps) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <ul aria-label="Chart series" className="flex min-w-0 flex-wrap gap-x-6 gap-y-3">
        {items.map((item) => (
          <li key={item.key} className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="break-words">{item.label}</span>
            </div>
            {item.value !== undefined && (
              <p className="mt-1 pl-5 font-mono text-sm font-medium tabular-nums text-foreground">
                {item.value}
              </p>
            )}
          </li>
        ))}
      </ul>
      {caption && (
        <p className="pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  )
}
