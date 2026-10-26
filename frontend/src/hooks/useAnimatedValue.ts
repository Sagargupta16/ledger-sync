import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'

import { useMotionValue, type MotionValue } from 'motion/react'

import { useMotionStore } from '@/store/motionStore'

/**
 * Parse a formatted value string ("₹45,33,242.00", "$1,234.56", "55.5%") into
 * its numeric part plus everything needed to re-render intermediate frames in
 * the SAME format: prefix, suffix, decimal places, and grouping style.
 */
interface ParsedValue {
  prefix: string
  suffix: string
  amount: number
  decimals: number
  grouping: 'indian' | 'western' | 'none'
}

const isDigit = (ch: string) => ch >= '0' && ch <= '9'

/**
 * Scan the number span starting at `start`: digits/commas, then an optional
 * decimal part. Returns the end index (exclusive) and decimal count.
 * Manual linear scan -- an equivalent digits-and-commas regex backtracks
 * super-linearly on the ambiguous comma (Sonar S8786).
 */
function scanNumber(sample: string, start: number): { end: number; decimals: number } {
  let i = start
  while (i < sample.length && (isDigit(sample[i]) || sample[i] === ',')) i++
  if (sample[i] !== '.') return { end: i, decimals: 0 }
  let j = i + 1
  while (j < sample.length && isDigit(sample[j])) j++
  return j > i + 1 ? { end: j, decimals: j - i - 1 } : { end: i, decimals: 0 }
}

/** Indian grouping has a 2-digit group after the first comma ("45,33,242");
 * western is all 3s ("4,533,242"). No comma = no grouping. */
function detectGrouping(intPart: string): ParsedValue['grouping'] {
  if (!intPart.includes(',')) return 'none'
  const groups = intPart.split(',')
  return groups.slice(1).some((g) => g.length === 2) ? 'indian' : 'western'
}

export function parseFormattedValue(sample: string): ParsedValue | null {
  // prefix = everything before the first digit, number = digits/commas +
  // optional decimal part, suffix = the rest.
  let firstDigit = -1
  for (let i = 0; i < sample.length; i++) {
    if (isDigit(sample[i])) {
      firstDigit = i
      break
    }
  }
  if (firstDigit === -1) return null

  const { end, decimals } = scanNumber(sample, firstDigit)
  const numeric = sample.slice(firstDigit, end)
  const amount = Number.parseFloat(numeric.replaceAll(',', ''))
  if (!Number.isFinite(amount)) return null

  const dot = numeric.indexOf('.')
  return {
    prefix: sample.slice(0, firstDigit),
    suffix: sample.slice(end),
    amount,
    decimals,
    grouping: detectGrouping(dot === -1 ? numeric : numeric.slice(0, dot)),
  }
}

/** Insert commas right-to-left every `size` digits. Linear, no regex. */
function groupFromRight(digits: string, size: number): string {
  const parts: string[] = []
  for (let end = digits.length; end > 0; end -= size) {
    parts.unshift(digits.slice(Math.max(0, end - size), end))
  }
  return parts.join(',')
}

function groupDigits(intStr: string, grouping: ParsedValue['grouping']): string {
  if (grouping === 'none' || intStr.length <= 3) return intStr
  if (grouping === 'western') return groupFromRight(intStr, 3)
  // Indian: last 3 digits, then groups of 2.
  const head = groupFromRight(intStr.slice(0, -3), 2)
  return `${head},${intStr.slice(-3)}`
}

export function formatLikeSample(n: number, parsed: ParsedValue): string {
  const fixed = Math.max(0, n).toFixed(parsed.decimals)
  const [intPart, decPart] = fixed.split('.')
  const grouped = groupDigits(intPart, parsed.grouping)
  return `${parsed.prefix}${grouped}${decPart !== undefined ? '.' + decPart : ''}${parsed.suffix}`
}

/**
 * The engine behind both count-ups below. Shows `text`; when `target` is a
 * number it first eases from the amount on screen to `target` over `duration`
 * ms (ease-out cubic), showing `frameText(amount)` on each frame, and the FINAL
 * frame always shows exactly `text`. Counting from the amount on screen lets an
 * interrupted count carry on from where it is, and a count with nothing to do
 * schedules no frame at all.
 *
 * Frames go into a MotionValue, never React state. Render it as the only child
 * of a `motion.*` element: Motion writes each frame straight into the text node
 * and skips a string that did not change, so the caller renders once per value
 * instead of once per frame.
 */
function useCountedText(
  text: string,
  target: number | null,
  frameText: (amount: number) => string,
  duration: number,
): MotionValue<string> {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const display = useMotionValue(text)
  const shown = useRef(0)

  // A layout effect: a value that does not count is on screen by the next
  // paint, as a render would put it. When a count starts, its first frame
  // replaces `text` before that paint, so the final figure never flashes first.
  useLayoutEffect(() => {
    display.set(text)
    if (target === null || target === shown.current || reduceMotion) {
      shown.current = target ?? 0
      return
    }
    const from = shown.current
    const to = target
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      // A frame timestamp can fall just before `start`; never ease backwards.
      const progress = Math.min(Math.max(now - start, 0) / duration, 1)
      if (progress >= 1) {
        // Settle on the exact original string -- correctness guarantee.
        shown.current = to
        display.set(text)
        return
      }
      const eased = 1 - Math.pow(1 - progress, 3)
      shown.current = from + (to - from) * eased
      display.set(frameText(shown.current))
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text, target, frameText, duration, reduceMotion, display])

  return display
}

/**
 * Count-up for ALREADY-FORMATTED value strings (currency, percentages).
 *
 * Animates the numeric part from the figure on screen (0 on mount) to the new
 * value over `duration` ms (ease-out cubic), formatting every frame like the
 * input (symbol, decimals, indian/western digit grouping). The FINAL frame
 * always renders the exact original string, so the settled display is
 * guaranteed byte-identical to what the caller formatted -- the animation can
 * never corrupt a number. Zero and non-numeric strings render as-is, no
 * animation.
 *
 * Re-runs when `value` changes, so KPI cards roll to their new figure when the
 * filter changes. Render the result as the only child of a `motion.*` element.
 */
export function useAnimatedValue(value: string | number, duration = 240): MotionValue<string> {
  const text = String(value)
  const parsed = useMemo(() => parseFormattedValue(text), [text])
  const frameText = useCallback(
    (amount: number) => (parsed ? formatLikeSample(amount, parsed) : text),
    [parsed, text],
  )
  const target = parsed && parsed.amount !== 0 ? parsed.amount : null
  return useCountedText(text, target, frameText, duration)
}

const roundedText = (amount: number) => String(Math.round(amount))

/**
 * The same count-up for a raw number shown rounded, such as a 0-100 score. It
 * eases the unrounded value, so every frame is `Math.round` of the eased
 * figure, and settles on `Math.round(value)`. Defaults to 900 ms, like
 * useCountUp. Render the result as the only child of a `motion.*` element.
 */
export function useAnimatedInteger(value: number, duration = 900): MotionValue<string> {
  return useCountedText(roundedText(value), value, roundedText, duration)
}
