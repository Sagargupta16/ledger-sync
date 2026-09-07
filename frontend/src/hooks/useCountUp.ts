import { useEffect, useRef, useState } from 'react'

import { useMotionStore } from '@/store/motionStore'

/**
 * Animate a number from 0 to `value` with an ease-out cubic over `duration` ms.
 * Returns the current animated value. Re-runs whenever `value` changes, so a
 * score that updates when new data arrives counts up to the new figure.
 *
 * rAF-driven (no interval drift). The persisted in-app motion mode can settle
 * the value immediately without changing its accessible output.
 */
export function useCountUp(value: number, duration = 900): number {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const [display, setDisplay] = useState({
    value: reduceMotion ? value : 0,
    reduceMotion,
  })
  const frame = useRef(0)
  const fromRef = useRef(0)

  if (
    display.reduceMotion !== reduceMotion ||
    (reduceMotion && display.value !== value)
  ) {
    setDisplay({
      value: reduceMotion ? value : display.value,
      reduceMotion,
    })
  }

  useEffect(() => {
    if (reduceMotion) {
      fromRef.current = value
      return
    }

    const from = fromRef.current
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from + (value - from) * eased
      setDisplay({ value: current, reduceMotion: false })
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value, duration, reduceMotion])

  return reduceMotion ? value : display.value
}
