import { useCountUp } from '@/hooks/useCountUp'

interface CountUpProps {
  value: number
  format: (value: number) => string
  duration?: number
}

/**
 * Leaf text node that counts to `value`. Kept tiny so each animation frame
 * re-renders only this text, not the chart around it. `useCountUp` settles
 * immediately when the in-app motion mode is Reduced.
 */
export function CountUp({ value, format, duration = 1200 }: Readonly<CountUpProps>) {
  return format(useCountUp(value, duration))
}
