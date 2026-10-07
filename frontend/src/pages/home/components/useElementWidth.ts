import { useEffect, useRef, useState } from 'react'

/**
 * Track an element's content width so an inline SVG can use a 1:1 viewBox
 * (text and stroke widths stay at their real pixel size at every breakpoint).
 * Falls back to `fallback` where ResizeObserver is unavailable (tests).
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const element = ref.current
    if (!element || !('ResizeObserver' in globalThis)) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
