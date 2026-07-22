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

export function parseFormattedValue(sample: string): ParsedValue | null {
  const match = /^(\D*)([\d,]+(?:\.\d+)?)(.*)$/s.exec(sample)
  if (!match) return null
  const [, prefix, numeric, suffix] = match
  const dot = numeric.indexOf('.')
  const decimals = dot === -1 ? 0 : numeric.length - dot - 1
  const amount = Number.parseFloat(numeric.replaceAll(',', ''))
  if (!Number.isFinite(amount)) return null

  // Indian grouping has a 2-digit group after the first comma ("45,33,242");
  // western is all 3s ("4,533,242"). No comma at all = no grouping.
  let grouping: ParsedValue['grouping'] = 'none'
  const intPart = dot === -1 ? numeric : numeric.slice(0, dot)
  if (intPart.includes(',')) {
    const groups = intPart.split(',')
    grouping = groups.slice(1).some((g) => g.length === 2) ? 'indian' : 'western'
  }
  return { prefix, suffix, amount, decimals, grouping }
}

function groupDigits(intStr: string, grouping: ParsedValue['grouping']): string {
  if (grouping === 'none' || intStr.length <= 3) return intStr
  if (grouping === 'western') return intStr.replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',')
  // Indian: last 3 digits, then groups of 2.
  const head = intStr.slice(0, -3)
  const tail = intStr.slice(-3)
  const groupedHead = head.replaceAll(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${groupedHead},${tail}`
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
export function useAnimatedValue(value: string | number, duration = 800): string {
  const stringValue = String(value)
  // null = not animating; render the exact input. Set only from rAF frames.
  const [frameValue, setFrameValue] = useState<string | null>(null)
  const fromRef = useRef(0)
  const frame = useRef(0)

  useEffect(() => {
    const parsed = parseFormattedValue(stringValue)
    if (!parsed || parsed.amount === 0) {
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
