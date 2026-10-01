import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Pins a page's filter/period controls under the workspace header while the
 * page scrolls, so changing FY, period, sort or filters never needs a scroll
 * back to the top.
 *
 * Placement: a DIRECT child of `PageContainer`'s content column, normally right
 * after `PageHeader`. A sticky element only sticks inside its parent, so inside
 * `PageHeader`'s `action` slot it could never pin.
 *
 * Geometry: the negative-margin/padding pair mirrors `PageContainer`'s
 * safe-area-aware horizontal padding, so the solid background bleeds to the
 * column edges (and under a notch) while the controls stay aligned with the
 * content below.
 *
 * Stuck state: an IntersectionObserver on the toolbar itself (root = the scroll
 * container, top margin -1px) flips `data-stuck` once it pins -- no per-frame
 * scroll listener. The hairline and elevation fade in through a CSS
 * transition, which the motion store's `data-motion="reduced"` mode (the
 * `html[data-motion='reduced'] *` rule in index.css) switches off app-wide.
 *
 * Offset: the toolbar publishes its measured height as `--sticky-toolbar-h` on
 * the scroll container (ResizeObserver), so other elements that stick to the
 * same container (TransactionTable's day headers, focus scroll-padding) sit
 * below it instead of under it. During a route cross-fade two toolbars can be
 * mounted; the newest one owns the variable.
 */
const offsetOwners = new WeakMap<HTMLElement, HTMLElement>()

function findScrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll') return el
  }
  return null
}

interface StickyToolbarProps {
  readonly children: ReactNode
  /** Extra classes for the toolbar surface (layout of its children). */
  readonly className?: string
  /** Accessible name, e.g. "Time range". Makes the toolbar a named region. */
  readonly label?: string
}

export default function StickyToolbar({ children, className, label }: StickyToolbarProps) {
  const ref = useRef<HTMLElement>(null)
  const [isStuck, setIsStuck] = useState(false)

  useEffect(() => {
    const toolbar = ref.current
    if (!toolbar) return
    const scroller = findScrollParent(toolbar)
    const cleanups: Array<() => void> = []

    // jsdom has neither observer; the toolbar still renders and sticks.
    if (typeof IntersectionObserver !== 'undefined') {
      // The root reaches 10 viewports below the scroller, so the only clipping
      // that can drop the ratio below 1 is the scroller's top edge. Without
      // it, a toolbar that starts partly below the fold and is then scrolled
      // straight to pinned stays under 1 throughout and never reports.
      const stuckObserver = new IntersectionObserver(
        ([entry]) => {
          const rootTop = entry.rootBounds?.top ?? 0
          setIsStuck(entry.intersectionRatio < 1 && entry.boundingClientRect.top < rootTop)
        },
        { root: scroller, rootMargin: '-1px 0px 1000% 0px', threshold: 1 },
      )
      stuckObserver.observe(toolbar)
      cleanups.push(() => stuckObserver.disconnect())
    }

    if (scroller && typeof ResizeObserver !== 'undefined') {
      offsetOwners.set(scroller, toolbar)
      const sizeObserver = new ResizeObserver(() => {
        if (offsetOwners.get(scroller) !== toolbar) return
        scroller.style.setProperty(
          '--sticky-toolbar-h',
          `${toolbar.getBoundingClientRect().height}px`,
        )
      })
      sizeObserver.observe(toolbar)
      cleanups.push(() => {
        sizeObserver.disconnect()
        if (offsetOwners.get(scroller) !== toolbar) return
        offsetOwners.delete(scroller)
        scroller.style.removeProperty('--sticky-toolbar-h')
      })
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [])

  return (
    <section
      ref={ref}
      aria-label={label}
      data-sticky-toolbar=""
      data-stuck={isStuck ? '' : undefined}
      className={cn(
        'sticky top-0 z-30 bg-background py-2',
        '-ml-[max(1rem,env(safe-area-inset-left))] -mr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]',
        'md:-ml-[max(1.5rem,env(safe-area-inset-left))] md:-mr-[max(1.5rem,env(safe-area-inset-right))] md:pl-[max(1.5rem,env(safe-area-inset-left))] md:pr-[max(1.5rem,env(safe-area-inset-right))]',
        'lg:-ml-[max(2rem,env(safe-area-inset-left))] lg:-mr-[max(2rem,env(safe-area-inset-right))] lg:pl-[max(2rem,env(safe-area-inset-left))] lg:pr-[max(2rem,env(safe-area-inset-right))]',
        // The hairline is a 1px shadow, not a border: index.css has an
        // unlayered `* { border-color }` that outranks Tailwind's layered
        // border-color utilities, so a transparent border could not be hidden.
        'transition-shadow duration-200 ease-[var(--ease-cinematic)]',
        'data-[stuck]:shadow-[0_1px_0_var(--hairline-2),var(--glass-shadow-strong)]',
        className,
      )}
    >
      {children}
    </section>
  )
}
