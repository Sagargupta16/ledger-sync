import { useState, useEffect } from 'react'

type Breakpoint = 'mobile' | 'tablet' | 'desktop'

interface ChartDimensions {
  /** Current breakpoint */
  breakpoint: Breakpoint
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
    angleXLabels: true,
    chartHeight: 250,
    showBarLabels: false,
  },
  tablet: {
    angleXLabels: true,
    chartHeight: 320,
    showBarLabels: true,
  },
  desktop: {
    angleXLabels: false,
    chartHeight: 400,
    showBarLabels: true,
  },
}

/**
 * Returns responsive chart configuration based on viewport width.
 * Updates on window resize.
 *
 * ```tsx
 * const dims = useChartDimensions()
 * <ChartEmptyState height={dims.chartHeight} message="..." />
 * ```
 */
export function useChartDimensions(): ChartDimensions {
  const [bp, setBp] = useState<Breakpoint>(() =>
    globalThis.window === undefined ? 'desktop' : getBreakpoint(globalThis.window.innerWidth),
  )

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setBp(getBreakpoint(globalThis.window.innerWidth)), 150)
    }
    globalThis.window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      globalThis.window.removeEventListener('resize', onResize)
    }
  }, [])

  return { breakpoint: bp, ...DIMENSIONS[bp] }
}
