/**
 * The root of every chart: measures its box, decides whether to animate, and
 * waits until it scrolls into view so the entrance plays where it is seen.
 * Replaces Recharts' ResponsiveContainer and the old ChartContainer.
 */

import { useId, useMemo, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { useInView } from 'motion/react'

import { useIsMobile } from '@/hooks/useIsMobile'
import { CHART_ANIMATION_THRESHOLD } from '@/constants/chartConfig'
import { useMotionStore } from '@/store/motionStore'
import { useThemeStore } from '@/store/themeStore'

import { FrameContext, type FrameState } from './chartContext'
import { useElementSize } from './useElementSize'
import { usePrinting } from './usePrinting'

/** A tall desktop chart is capped on phones so it never fills the screen. */
const MOBILE_HEIGHT_CAP = 280

const HAS_OBSERVER = typeof IntersectionObserver !== 'undefined'
const NO_ELEMENT = { current: null }

export interface ChartFrameProps {
  /** Pixels, or 'fill' to take the parent's height. */
  readonly height?: number | 'fill'
  readonly mobileHeight?: number
  /** One-sentence description; the frame is announced as a single image. */
  readonly ariaLabel?: string
  /** Number of data points; very long series skip the entrance animation. */
  readonly dataLength?: number
  /** SVG content. */
  readonly children: ReactNode
  /** HTML drawn above the SVG (tooltips, centre labels). */
  readonly overlay?: ReactNode
  /** Makes the frame focusable and routes arrow keys, for keyboard inspection. */
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  readonly onBlur?: () => void
  readonly className?: string
}

export default function ChartFrame({
  height = 300,
  mobileHeight,
  ariaLabel,
  dataLength = 0,
  children,
  overlay,
  onKeyDown,
  onBlur,
  className = '',
}: ChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chartId = `chart${useId().replaceAll(':', '')}`
  const isMobile = useIsMobile()
  const reduced = useMotionStore((state) => state.mode === 'reduced')
  const theme = useThemeStore((state) => state.resolved)
  const printing = usePrinting()
  // Motion's inView constructs an IntersectionObserver unguarded; jsdom has none.
  const inView = useInView(HAS_OBSERVER ? ref : NO_ELEMENT, { once: true, amount: 0.2 })
  const size = useElementSize(ref)

  const fixedHeight = height === 'fill' ? null : resolveHeight(isMobile, height, mobileHeight)
  const plotHeight = fixedHeight ?? size.height
  // Printing paints final geometry: a chart never scrolled into view must not print mid-entrance.
  const animate = !reduced && !printing && dataLength < CHART_ANIMATION_THRESHOLD
  const entered = !animate || inView || !HAS_OBSERVER

  const frame = useMemo<FrameState>(
    () => ({ width: size.width, height: plotHeight, animate, entered, isMobile, theme, chartId }),
    [size.width, plotHeight, animate, entered, isMobile, theme, chartId],
  )

  const style = fixedHeight === null ? undefined : ({ '--chart-h': `${fixedHeight}px` } as CSSProperties)

  return (
    <div
      ref={ref}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      tabIndex={onKeyDown ? 0 : undefined}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={`chart-frame relative w-full min-w-0 max-w-full touch-pan-y select-none ${fixedHeight === null ? 'h-full' : 'h-(--chart-h)'} rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      style={style}
    >
      <FrameContext.Provider value={frame}>
        {size.width > 0 && plotHeight > 0 && (
          <svg
            width={size.width}
            height={plotHeight}
            viewBox={`0 0 ${size.width} ${plotHeight}`}
            className="block overflow-visible [&_text]:tabular-nums"
            aria-hidden="true"
            focusable="false"
          >
            {children}
          </svg>
        )}
        {size.width > 0 && overlay}
      </FrameContext.Provider>
    </div>
  )
}

function resolveHeight(isMobile: boolean, height: number, mobileHeight?: number): number {
  if (!isMobile) return height
  if (mobileHeight !== undefined) return mobileHeight
  return Math.min(height, MOBILE_HEIGHT_CAP)
}
