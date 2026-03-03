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
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.06]"
      style={{ height }}
    >
      <div className="p-3 rounded-xl bg-white/[0.04]">
        <BarChart3 className="w-6 h-6 text-zinc-500" />
      </div>
      <p className="text-sm text-zinc-500">{message}</p>
    </div>
  )
}
