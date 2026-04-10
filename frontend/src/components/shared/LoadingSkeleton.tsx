export default function LoadingSkeleton({ className = '' }: Readonly<{ className?: string }>) {
  return (
    <div className={`animate-pulse bg-white/[0.04] rounded-lg ${className}`} />
  )
}

export function MetricCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-6">
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
    <div className={`glass rounded-2xl p-6 ${height}`}>
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

export function SectionSkeleton({ title = true, children }: Readonly<{ title?: boolean; children?: React.ReactNode }>) {
  return (
    <div className="glass rounded-2xl border border-border p-6 space-y-4">
      {title && <LoadingSkeleton className="h-5 w-40" />}
      {children ?? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => <LoadingSkeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
          <LoadingSkeleton className="h-48 w-full rounded-xl" />
        </>
      )}
    </div>
  )
}

export function CardGridSkeleton({ count = 4, cols = 'grid-cols-2 lg:grid-cols-4' }: Readonly<{ count?: number; cols?: string }>) {
  return (
    <div className={`grid ${cols} gap-4`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="glass rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <LoadingSkeleton className="w-8 h-8 rounded-lg" />
            <LoadingSkeleton className="h-3 w-20" />
          </div>
          <LoadingSkeleton className="h-5 w-24" />
          <LoadingSkeleton className="h-2 w-16" />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <LoadingSkeleton className="h-7 w-48" />
          <LoadingSkeleton className="h-4 w-72" />
        </div>
        <LoadingSkeleton className="h-10 w-32 rounded-xl" />
      </div>
      <CardGridSkeleton />
      <ChartSkeleton />
      <ChartSkeleton height="h-64" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="bg-white/[0.04] p-4 border-b border-white/[0.06]">
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
