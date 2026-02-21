export default function LoadingSkeleton({ className = '' }: Readonly<{ className?: string }>) {
  return (
    <div className={`animate-pulse bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%] rounded-lg ${className}`} />
  )
}

export function MetricCardSkeleton() {
  return (
    <div className="glass rounded-xl border border-border p-6 shadow-lg">
      <div className="flex items-center gap-3">
        <LoadingSkeleton className="w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <LoadingSkeleton className="h-4 w-24" />
          <LoadingSkeleton className="h-8 w-32" />
        </div>
      </div>
    </div>
  )
}

export function ChartSkeleton({ height = 'h-80' }: Readonly<{ height?: string }>) {
  return (
    <div className={`glass rounded-xl border border-border p-6 shadow-lg ${height}`}>
      <div className="space-y-4 h-full">
        <div className="flex items-center gap-3">
          <LoadingSkeleton className="w-5 h-5 rounded" />
          <LoadingSkeleton className="h-5 w-48" />
        </div>
        <div className="flex-1 flex items-end gap-2 pb-4">
          {Array.from({ length: 12 }, (_, i) => ({
            id: `chart-bar-${((i * 7) % 60) + 40}`,
            heightPercent: ((i * 7) % 60) + 40,
          })).map((bar) => (
            <div key={bar.id} className="flex-1" style={{ height: `${bar.heightPercent}%` }}>
              <LoadingSkeleton className="h-full w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <div className="glass rounded-xl border border-border overflow-hidden">
      <div className="bg-white/5 p-4 border-b border-border">
        <div className="flex gap-4">
          <LoadingSkeleton className="h-4 w-24" />
          <LoadingSkeleton className="h-4 w-32" />
          <LoadingSkeleton className="h-4 w-20" />
          <LoadingSkeleton className="h-4 flex-1" />
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }, (_, i) => `table-row-${i + 1}`).map((rowKey) => (
          <div key={rowKey} className="p-4 flex gap-4">
            <LoadingSkeleton className="h-4 w-24" />
            <LoadingSkeleton className="h-4 w-32" />
            <LoadingSkeleton className="h-4 w-20" />
            <LoadingSkeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
