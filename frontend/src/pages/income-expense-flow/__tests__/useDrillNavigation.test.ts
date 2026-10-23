import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { DrillCrumb } from '../sankeyDrilldown'
import { useDrillNavigation } from '../useDrillNavigation'

const family: DrillCrumb = { label: 'Family', view: 'category', flow: 'expense' }

describe('useDrillNavigation', () => {
  it('zooms a drill in from the clicked node and Back out from the centre', () => {
    const { result } = renderHook(() => useDrillNavigation('2026-04-01|2027-03-31'))
    act(() => result.current.drillInto(family, { x: 120, y: 340 }))
    expect(result.current).toMatchObject({ drillPath: [family], drillDirection: 'in', zoomOrigin: { x: 120, y: 340 } })
    act(() => result.current.drillBack())
    expect(result.current).toMatchObject({ drillPath: [], drillDirection: 'out', zoomOrigin: null })
  })

  it('returns a period switch to the overview with no stale zoom-in origin', () => {
    const { result, rerender } = renderHook(({ period }) => useDrillNavigation(period), {
      initialProps: { period: '2026-04-01|2027-03-31' },
    })
    act(() => result.current.drillInto(family, { x: 120, y: 340 }))
    rerender({ period: '2025-04-01|2026-03-31' })
    expect(result.current).toMatchObject({ drillPath: [], drillDirection: 'out', zoomOrigin: null })
  })
})
