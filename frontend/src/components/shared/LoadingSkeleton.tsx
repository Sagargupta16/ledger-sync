import type { ReactNode } from 'react'

/**
 * Single pulsing bar. Decorative -- the surrounding skeleton container owns the
 * loading announcement, so individual bars are `aria-hidden` to avoid a
 * screen reader reading "Loading" once per bar. Inside a `skeleton-group`
 * wrapper the bar holds still and the wrapper pulses the whole group as one
 * layer; the composites below put that wrapper inside each panel, never on it.
 */
export default function LoadingSkeleton({ className = '' }: Readonly<{ className?: string }>) {
  return (
    <div aria-hidden className={`skeleton-surface rounded-lg ${className}`} />
  )
}

/** Wraps a composite skeleton so AT announces a single "Loading" status. */
export function SkeletonStatus({
  children,
  className = '',
  label = 'Loading',
}: Readonly<{ children: ReactNode; className?: string; label?: string }>) {
  return (
    <div aria-busy="true" className={className}>
      <output className="sr-only">{label}</output>
      {children}
    </div>
  )
}

/** Title bar over a chart-like bar row; the body of `ChartSkeleton`. */
function ChartSkeletonBody() {
  return (
    <div className="skeleton-group space-y-4 h-full">
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
  )
}

/** Metric tiles; the cells of `CardGridSkeleton`. */
function CardGridSkeletonCells({ count }: Readonly<{ count: number }>) {
  return Array.from({ length: count }, (_, i) => `card-${i + 1}`).map((cardKey) => (
    <div key={cardKey} className="ledger-panel p-4">
      <div className="skeleton-group space-y-3">
        <div className="flex items-center gap-2">
          <LoadingSkeleton className="w-8 h-8 rounded-lg" />
          <LoadingSkeleton className="h-3 w-20" />
        </div>
        <LoadingSkeleton className="h-5 w-24" />
        <LoadingSkeleton className="h-2 w-16" />
      </div>
    </div>
  ))
}

export function ChartSkeleton({ height = 'h-80' }: Readonly<{ height?: string }>) {
  return (
    <SkeletonStatus className={`ledger-panel p-4 sm:p-5 ${height}`}>
      <ChartSkeletonBody />
    </SkeletonStatus>
  )
}

/**
 * Panel with a title bar over `blocks` stacked body blocks, for a card that
 * loads as one unit. `blockClassName` sets each block's height.
 */
export function PanelSkeleton({ blockClassName = 'h-32', blocks = 1 }: Readonly<{ blockClassName?: string; blocks?: number }>) {
  return (
    <SkeletonStatus className="ledger-panel p-4 sm:p-5">
      <div className="skeleton-group">
        <LoadingSkeleton className="mb-4 h-8 w-1/3" />
        <div className="space-y-3">
          {Array.from({ length: blocks }, (_, i) => `panel-block-${i + 1}`).map((blockKey) => (
            <LoadingSkeleton key={blockKey} className={blockClassName} />
          ))}
        </div>
      </div>
    </SkeletonStatus>
  )
}

export function CardGridSkeleton({ count = 4, cols = 'grid-cols-2 lg:grid-cols-4' }: Readonly<{ count?: number; cols?: string }>) {
  return (
    <SkeletonStatus className={`grid ${cols} gap-4`}>
      <CardGridSkeletonCells count={count} />
    </SkeletonStatus>
  )
}

/** Whole-page placeholder. One status for the page, so AT hears "Loading" once. */
export function PageSkeleton() {
  return (
    <SkeletonStatus className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="skeleton-group flex items-center justify-between">
        <div className="space-y-2">
          <LoadingSkeleton className="h-7 w-48" />
          <LoadingSkeleton className="h-4 w-72" />
        </div>
        <LoadingSkeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardGridSkeletonCells count={4} />
      </div>
      <div className="ledger-panel p-4 sm:p-5 h-80">
        <ChartSkeletonBody />
      </div>
      <div className="ledger-panel p-4 sm:p-5 h-64">
        <ChartSkeletonBody />
      </div>
    </SkeletonStatus>
  )
}

/** One header or body row's bars, inside the padded row so its divider holds still. */
function TableSkeletonCells() {
  return (
    <div className="skeleton-group flex gap-4">
      <LoadingSkeleton className="h-4 w-24" />
      <LoadingSkeleton className="h-4 w-32" />
      <LoadingSkeleton className="h-4 w-20" />
      <LoadingSkeleton className="h-4 flex-1" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <SkeletonStatus className="ledger-panel overflow-hidden">
      <div className="bg-[var(--overlay-2)] p-4 border-b border-border">
        <TableSkeletonCells />
      </div>
      <div className="divide-y divide-[var(--hairline-1)]">
        {Array.from({ length: rows }, (_, i) => `table-row-${i + 1}`).map((rowKey) => (
          <div key={rowKey} className="p-4">
            <TableSkeletonCells />
          </div>
        ))}
      </div>
    </SkeletonStatus>
  )
}
