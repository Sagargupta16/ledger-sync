import { useEffect, useRef, useState } from 'react'

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
 * Count-up for ALREADY-FORMATTED value strings (currency, percentages).
 *
 * Animates the numeric part 0 -> value over `duration` ms (ease-out cubic)
 * while re-rendering every frame in the same format (symbol, decimals,
 * indian/western digit grouping) detected from the input. The FINAL frame
 * always renders the exact original string, so the settled display is
 * guaranteed byte-identical to what the caller formatted -- the animation can
 * never corrupt a number. Non-numeric strings render as-is, no animation.
 *
 * Re-runs when `value` changes (animating from the previous amount), so KPI
 * cards roll to their new figure when the filter changes.
 */
export function useAnimatedValue(value: string | number, duration = 240): string {
  const stringValue = String(value)
  // null = not animating; render the exact input. Set only from rAF frames.
  const [frameValue, setFrameValue] = useState<string | null>(null)
  const fromRef = useRef(0)
  const frame = useRef(0)

  useEffect(() => {
    const parsed = parseFormattedValue(stringValue)
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (!parsed || parsed.amount === 0 || reduceMotion) {
      fromRef.current = parsed?.amount ?? 0
      return
    }
    const from = fromRef.current
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      if (progress >= 1) {
        // Settle on the exact original string -- correctness guarantee.
        setFrameValue(null)
        fromRef.current = parsed.amount
        return
      }
      const eased = 1 - Math.pow(1 - progress, 3)
      setFrameValue(formatLikeSample(from + (parsed.amount - from) * eased, parsed))
      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame.current)
      setFrameValue(null)
    }
  }, [stringValue, duration])

  return frameValue ?? stringValue
}
