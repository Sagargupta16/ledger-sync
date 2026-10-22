import { ChevronRight, CornerUpLeft } from 'lucide-react'

import type { DrillCrumb } from '../sankeyDrilldown'

/** Breadcrumb: "All cash flow / Family". Earlier crumbs are buttons that
 * truncate the trail; the current level is static text. */
export default function DrillBreadcrumb({
  drillPath,
  drillTo,
  drillBack,
}: Readonly<{ drillPath: DrillCrumb[]; drillTo: (depth: number) => void; drillBack: () => void }>) {
  if (drillPath.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Select a category with <span className="font-semibold">›</span> to explore its breakdown
      </p>
    )
  }
  return (
    <nav aria-label="Cash flow drill-down path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => drillTo(0)}
        className="flex min-h-11 shrink-0 items-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-[var(--overlay-2)] hover:text-foreground"
      >
        All cash flow
      </button>
      {drillPath.map((crumb, i) => {
        const isLast = i === drillPath.length - 1
        return (
          // Depth in the key: the same label can legally appear twice in a
          // path (the Tax branch drilling into a category also named Tax).
          <span key={`${i}-${crumb.view}-${crumb.label}`} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="w-3.5 h-3.5 text-text-quaternary shrink-0" aria-hidden />
            {isLast ? (
              <span className="font-semibold text-foreground truncate" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => drillTo(i + 1)}
                className="flex min-h-11 items-center truncate rounded-md px-2 text-muted-foreground transition-colors hover:bg-[var(--overlay-2)] hover:text-foreground"
              >
                {crumb.label}
              </button>
            )}
          </span>
        )
      })}
      <button
        type="button"
        onClick={drillBack}
        className="ml-2 flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-[var(--overlay-2)] hover:text-foreground"
        aria-label="Back one level"
      >
        <CornerUpLeft className="w-3 h-3" aria-hidden />
        Back
      </button>
    </nav>
  )
}
