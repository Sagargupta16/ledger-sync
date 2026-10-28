import type { ChartSpec } from './chartSpec'

/** The computed last bar of a waterfall: where the steps end up. */
export const NET_LABEL = 'Net'

export interface WaterfallStep {
  readonly label: string
  readonly change: number
  readonly start: number
  readonly end: number
  readonly net: boolean
}

/** Each change floats from the running total before it; the Net bar stands on zero. */
export function waterfallSteps(spec: ChartSpec): WaterfallStep[] {
  const key = spec.series[0].key
  let running = 0
  const steps = spec.data.map((row) => {
    const change = Number(row[key])
    const step = { label: String(row[spec.xKey]), change, start: running, end: running + change, net: false }
    running += change
    return step
  })
  // A step the model itself called "Net" keeps its name; the computed bar steps aside.
  const label = steps.some((step) => step.label === NET_LABEL) ? `${NET_LABEL} total` : NET_LABEL
  return [...steps, { label, change: running, start: 0, end: running, net: true }]
}

/** "+" on a rise, nothing on a fall (the minus is in the number) or on the net total. */
export function signed(step: WaterfallStep, text: string): string {
  return !step.net && step.change >= 0 ? `+${text}` : text
}
