import { Info } from 'lucide-react'

interface CostBasisOnlyNoticeProps {
  /** What the surface would show if market values existed, e.g. "Return and XIRR". */
  readonly metricLabel: string
  /** Optional extra sentence about what IS shown instead. */
  readonly shownInstead?: string
}

/**
 * Inline notice that a surface can only show cost basis, not performance.
 *
 * A bank statement records the cash you moved into an investment account. It
 * never records what the holding is worth today -- no NAV, no unit price, no
 * quantity. Any "return", "CAGR", "XIRR" or "gain" derived purely from those
 * flows is therefore not a return at all: with terminal value set to the same
 * contributions that produced it, the arithmetic collapses to a rounding
 * residue at best and a fabricated three-figure loss at worst.
 *
 * So these pages show cost basis only, and say why. The concept is not dropped:
 * the copy tells the user exactly which input would make the metric real, which
 * is the honest alternative to a confident wrong number.
 */
export default function CostBasisOnlyNotice({
  metricLabel,
  shownInstead,
}: CostBasisOnlyNoticeProps) {
  return (
    <output className="flex items-start gap-2.5 rounded-xl border border-info/20 bg-info/10 px-3 py-2.5 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
      <p className="text-foreground">
        <span className="font-medium">{metricLabel}</span> needs today&apos;s market value, which
        bank and broker statements do not carry - they only record the cash you moved in and out.
        {shownInstead ? ` ${shownInstead}` : ''}
      </p>
    </output>
  )
}
