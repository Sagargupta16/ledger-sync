import { BarChart3 } from 'lucide-react'

interface ChartEmptyStateProps {
  readonly message?: string
  readonly height?: number
}

/**
 * Empty state placeholder for charts with no data.
 * Drop this inside a ResponsiveContainer or chart wrapper when data is empty.
 */
export default function ChartEmptyState({
  message = 'No data available for the selected period',
  height = 300,
}: ChartEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 text-muted-foreground rounded-xl border border-border"
      style={{ height }}
    >
      <BarChart3 className="w-10 h-10 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
