/**
 * Drop-in replacement for Recharts' ResponsiveContainer.
 *
 * Adds minWidth={0} and minHeight={0} to prevent negative dimension
 * calculations. The corresponding console warning is suppressed globally
 * in main.tsx (before any component renders).
 *
 * Optional `mobileHeight` is applied when the viewport is below the
 * Tailwind `sm` breakpoint (640px). Lets individual charts shrink on
 * phones without forking every call-site.
 *
 * Usage: import { ChartContainer } from '@/components/ui' and use it
 * exactly like <ResponsiveContainer>.
 */

import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

import { useIsMobile } from '@/hooks/useIsMobile'

type ResponsiveDimension = number | `${number}%`

interface ChartContainerProps {
  width?: ResponsiveDimension
  height?: ResponsiveDimension
  mobileHeight?: ResponsiveDimension
  minWidth?: number
  minHeight?: number
  aspect?: number
  children: ReactNode
  /**
   * Accessible label describing what the chart shows. Recharts renders
   * SVGs that screen readers can't interpret meaningfully, so chart
   * authors should pass a one-sentence description here -- e.g.
   * ``ariaLabel="Net worth over the last 12 months"``. Surfaced as a
   * ``role="img"`` wrapper so AT users get the gist without trying to
   * walk every <path>.
   */
  ariaLabel?: string
}

/**
 * When the caller doesn't specify `mobileHeight`, we still cap very tall
 * desktop defaults so a 400px chart on a 667px iPhone doesn't eat the
 * whole viewport. 280px is tall enough to read axis labels + tooltip.
 */
const MOBILE_HEIGHT_CAP = 280

export default function ChartContainer({
  width = '100%',
  height = '100%',
  mobileHeight,
  children,
  ariaLabel,
  ...rest
}: Readonly<ChartContainerProps>) {
  const isMobile = useIsMobile()
  const resolvedHeight = resolveHeight(isMobile, height, mobileHeight)

  const container = (
    <ResponsiveContainer
      width={width}
      height={resolvedHeight}
      minWidth={0}
      minHeight={0}
      {...rest}
    >
      {children}
    </ResponsiveContainer>
  )

  if (!ariaLabel) return container

  // Wrap in a role="img" with the descriptive label so screen readers
  // announce a single meaningful summary instead of walking every SVG node.
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height: '100%' }}>
      {container}
    </div>
  )
}

function resolveHeight(
  isMobile: boolean,
  height: ResponsiveDimension,
  mobileHeight?: ResponsiveDimension,
): ResponsiveDimension {
  if (!isMobile) return height
  if (mobileHeight !== undefined) return mobileHeight
  // Numeric heights above the cap get auto-shrunk on mobile.
  // Percent strings (`'100%'`) pass through unchanged.
  if (typeof height === 'number' && height > MOBILE_HEIGHT_CAP) return MOBILE_HEIGHT_CAP
  return height
}
