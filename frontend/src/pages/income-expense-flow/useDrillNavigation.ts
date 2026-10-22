import { useCallback, useState } from 'react'

import type { DrillCrumb } from './sankeyDrilldown'

export interface ZoomOrigin {
  x: number
  y: number
}

/**
 * The Sankey's drill path (breadcrumb stack; empty is the overview) and how
 * the last move zooms. Forward zooms the new view IN from the clicked node's
 * chart coordinates; back zooms it OUT from the centre. A new `resetKey` (the
 * selected period) returns to the overview as a reset, never as a zoom in.
 */
export function useDrillNavigation(resetKey: string) {
  const [drillPath, setDrillPath] = useState<DrillCrumb[]>([])
  const [drillDirection, setDrillDirection] = useState<'in' | 'out'>('in')
  const [zoomOrigin, setZoomOrigin] = useState<ZoomOrigin | null>(null)

  // Changing the time filter can remove the drilled category entirely, so a
  // period switch always returns to the overview. State-adjust-during-render
  // (not an effect) per React's "adjusting state when props change" pattern.
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setDrillPath([])
    // A reset, like "All cash flow": the overview settles in from the centre
    // instead of zooming in from the node last clicked in the old period.
    setDrillDirection('out')
    setZoomOrigin(null)
  }

  const drillInto = useCallback((crumb: DrillCrumb, origin?: ZoomOrigin) => {
    setDrillDirection('in')
    setZoomOrigin(origin ?? null)
    setDrillPath((path) => [...path, crumb])
  }, [])

  /** Truncate to the first `depth` crumbs; 0 = back to overview. */
  const drillTo = useCallback((depth: number) => {
    setDrillDirection('out')
    setZoomOrigin(null)
    setDrillPath((path) => (depth >= path.length ? path : path.slice(0, depth)))
  }, [])

  const drillBack = useCallback(() => {
    setDrillDirection('out')
    setZoomOrigin(null)
    setDrillPath((path) => path.slice(0, -1))
  }, [])

  return { drillPath, drillDirection, zoomOrigin, drillInto, drillTo, drillBack }
}
