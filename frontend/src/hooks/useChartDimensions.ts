import { useState, useEffect } from 'react'

type Breakpoint = 'mobile' | 'tablet' | 'desktop'

interface ChartDimensions {
  /** Current breakpoint */
  breakpoint: Breakpoint
  /** Whether to show the legend (hide on mobile) */
  showLegend: boolean
  /** Chart margins — tighter on mobile */
  margin: { top: number; right: number; bottom: number; left: number }
  /** Max tick labels to show on X axis */
  maxXLabels: number
  /** Font size for axis ticks */
  tickFontSize: number
  /** Whether to angle X labels (saves space on mobile) */
  angleXLabels: boolean
  /** Suggested chart height in px */
  chartHeight: number
  /** Whether to show data labels on bars */
  showBarLabels: boolean
}

const MOBILE_MAX = 640
const TABLET_MAX = 1024

function getBreakpoint(width: number): Breakpoint {
  if (width < MOBILE_MAX) return 'mobile'
  if (width < TABLET_MAX) return 'tablet'
  return 'desktop'
}

const DIMENSIONS: Record<Breakpoint, Omit<ChartDimensions, 'breakpoint'>> = {
  mobile: {
    showLegend: false,
    margin: { top: 10, right: 10, bottom: 40, left: 40 },
    maxXLabels: 5,
    tickFontSize: 9,
    angleXLabels: true,
    chartHeight: 250,
    showBarLabels: false,
  },
  tablet: {
    showLegend: true,
    margin: { top: 10, right: 20, bottom: 50, left: 50 },
    maxXLabels: 8,
    tickFontSize: 10,
    angleXLabels: true,
    chartHeight: 320,
    showBarLabels: true,
  },
  desktop: {
    showLegend: true,
    margin: { top: 10, right: 30, bottom: 60, left: 60 },
    maxXLabels: 15,
    tickFontSize: 11,
    angleXLabels: false,
    chartHeight: 400,
    showBarLabels: true,
  },
}

/**
 * Returns responsive chart configuration based on viewport width.
 * Updates on window resize. Use this in every chart component:
 *
 * ```tsx
 * const dims = useChartDimensions()
 * <ResponsiveContainer height={dims.chartHeight}>
 *   <BarChart margin={dims.margin}>
 *     <XAxis tick={{ fontSize: dims.tickFontSize }} interval={getSmartInterval(data.length, dims.maxXLabels)} />
 *     {dims.showLegend && <Legend />}
 *   </BarChart>
 * </ResponsiveContainer>
 * ```
 */
export function useChartDimensions(): ChartDimensions {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window !== 'undefined' ? getBreakpoint(window.innerWidth) : 'desktop',
  )

  useEffect(() => {
    const onResize = () => setBp(getBreakpoint(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { breakpoint: bp, ...DIMENSIONS[bp] }
}
