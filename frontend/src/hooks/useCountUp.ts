import { useEffect, useRef, useState } from 'react'

/**
 * Animate a number from 0 to `value` with an ease-out cubic over `duration` ms.
 * Returns the current animated value. Re-runs whenever `value` changes, so a
 * score that updates when new data arrives counts up to the new figure.
 *
 * rAF-driven (no interval drift). Motion stays visible by design -- this app
 * does not gate animation behind prefers-reduced-motion.
 */
export function useCountUp(value: number, duration = 900): number {
  const [display, setDisplay] = useState(0)
  const frame = useRef(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from + (value - from) * eased
      setDisplay(current)
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value, duration])

  return display
}
