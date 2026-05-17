import { useEffect, useRef, useState, type ReactNode } from 'react'

interface LazySectionProps {
  /** Children rendered only after the section enters the viewport. */
  readonly children: ReactNode
  /** Placeholder shown while the section is below the fold. */
  readonly fallback?: ReactNode
  /** rootMargin applied to the IntersectionObserver. Defaults to '200px 0px'
   *  so the children mount slightly before they reach the viewport, hiding
   *  the spawn flash on slow scroll. */
  readonly rootMargin?: string
  /** Min reserved height while the placeholder is rendered. Prevents
   *  layout shift when the real content arrives. */
  readonly minHeight?: number | string
}

/**
 * Defer rendering of a heavy section (chart, large table) until it
 * scrolls into the viewport. Useful on long pages like Spending Analysis
 * or Year-in-Review where multiple chart components mount eagerly today
 * and slow first paint.
 *
 * Usage:
 *   <LazySection minHeight={320} fallback={<Skeleton />}>
 *     <ExpensiveChart />
 *   </LazySection>
 *
 * The IntersectionObserver disconnects after first reveal so re-mounts on
 * scroll-out are avoided -- once visible, the content stays mounted.
 */
export function LazySection({
  children,
  fallback,
  rootMargin = '200px 0px',
  minHeight = 240,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    if (visible) return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
            return
          }
        }
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible, rootMargin])

  return (
    <div
      ref={ref}
      style={visible ? undefined : { minHeight }}
      aria-busy={!visible}
    >
      {visible ? children : fallback}
    </div>
  )
}
