import { tickStep } from '@/components/charts/scales'

/** A fixed value-axis domain with its ticks, for CartesianChart's valueDomain/valueTicks. */
export interface AlignedAxis {
  readonly domain: readonly [number, number]
  readonly ticks: readonly number[]
}

/**
 * Two value axes whose zeros and ticks line up. The monthly bars read on the
 * left and the cumulative line on the right, but both must cross break-even on
 * one zero line and share one set of grid lines: two independent domains put
 * the line's zero elsewhere, so a positive total could sit under the bars'
 * zero. Each axis keeps its own 1/2/5 step and both get as many steps below
 * and above zero as the side that needs the most.
 */
export function alignZeroAxes(
  left: readonly number[],
  right: readonly number[],
  tickCount: number,
): readonly [AlignedAxis, AlignedAxis] {
  const sides = [left, right].map((values) => {
    const low = Math.min(0, ...values)
    const high = Math.max(0, ...values)
    const step = tickStep(low, high, tickCount)
    // The epsilon keeps a value sitting exactly on a step from adding one more.
    return { step, below: Math.max(0, Math.ceil(-low / step - 1e-9)), above: Math.max(0, Math.ceil(high / step - 1e-9)) }
  })
  const below = Math.max(...sides.map((side) => side.below))
  // An all-zero window still needs one step of height to draw in.
  const above = Math.max(below === 0 ? 1 : 0, ...sides.map((side) => side.above))
  const [first, second] = sides.map(({ step }): AlignedAxis => {
    const digits = Math.max(0, -Math.floor(Math.log10(step)))
    return {
      domain: [-below * step, above * step],
      // Rounded to the step's precision, so 0.30000000000000004 stays off the axis.
      ticks: Array.from({ length: below + above + 1 }, (_, index) => Number(((index - below) * step).toFixed(digits))),
    }
  })
  return [first, second]
}
