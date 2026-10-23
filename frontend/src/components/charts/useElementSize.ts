import { useLayoutEffect, useState, type RefObject } from 'react'

/** jsdom and very old browsers have no ResizeObserver; charts still render at this width. */
const FALLBACK_WIDTH = 640

/** Content-box size of `ref`, tracked with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof ResizeObserver === 'undefined') {
      setSize({ width: element.clientWidth || FALLBACK_WIDTH, height: element.clientHeight })
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      // Whole pixels keep sub-pixel layout jitter from re-rendering every mark.
      setSize((previous) =>
        previous.width === Math.round(width) && previous.height === Math.round(height)
          ? previous
          : { width: Math.round(width), height: Math.round(height) },
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
