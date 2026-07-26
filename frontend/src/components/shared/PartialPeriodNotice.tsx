import { Info } from 'lucide-react'

interface PartialPeriodNoticeProps {
  /** Human label for the incomplete period, e.g. "Jul 2026" or "FY 2026-27". */
  readonly label: string
  /** Days of the period that have already happened. */
  readonly daysElapsed: number
  /** Full calendar length of the period. */
  readonly daysTotal: number
  /** What the surface did about it, e.g. "Excluded from month comparisons." */
  readonly treatment: string
}

/**
 * Inline notice that a period on screen is still in progress.
 *
 * A month that is 26 days into 31 has full rent debited but no salary credited
 * yet, so charting it beside complete months makes spending look controlled and
 * the savings rate read hundreds of percent negative. Every surface that either
 * hides or truncates such a period must say so instead of silently changing the
 * numbers -- an unexplained gap in a trend chart is its own kind of lie.
 *
 * Renders nothing once the period is complete, so callsites can drop it in
 * without their own visibility check.
 */
export default function PartialPeriodNotice({
  label,
  daysElapsed,
  daysTotal,
  treatment,
}: PartialPeriodNoticeProps) {
  if (daysElapsed >= daysTotal) return null

  return (
    <output className="flex items-start gap-2.5 rounded-xl border border-warning/20 bg-warning/10 px-3 py-2.5 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p className="text-foreground">
        <span className="font-medium">{label}</span> is still in progress -{' '}
        <span className="tabular-nums">
          {daysElapsed} of {daysTotal}
        </span>{' '}
        days elapsed. {treatment}
      </p>
    </output>
  )
}
