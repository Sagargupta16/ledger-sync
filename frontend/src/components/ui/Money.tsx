import { forwardRef } from 'react'

import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/formatters'

/**
 * Right-aligned money display that never truncates.
 *
 * Before this, every table / list that showed a money amount hand-rolled the
 * same combo: `tabular-nums`, `text-right`, `font-medium`, plus a fixed width
 * class if it was in a narrow flex row. The Budget page's initial version
 * missed `whitespace-nowrap` and the amount digits got clipped inside the
 * 33%-wide grid cell -- "₹12,913.24" rendered as "₹12,91".
 *
 * `<Money>` codifies the canonical amount-cell rule:
 *   - `tabular-nums`  -- digits align vertically
 *   - `text-right`    -- always right-aligned
 *   - `whitespace-nowrap` -- never truncates mid-number
 *   - `shrink-0`      -- flex parents can't compress it
 *   - default `font-medium` weight (override via `bold`)
 *
 * Consumers pick the width via a preset (`sm` | `md` | `lg`) or a raw class
 * for the rare custom case. No fixed default width -- the caller knows its
 * layout, and forcing one would break the many free-flowing usages.
 *
 * @example
 *   <Money value={12913.24} width="md" />
 *   <Money value={budget.spent} width="sm" muted />
 *   <Money value={hero} bold className="text-2xl" />
 */
type Width = 'sm' | 'md' | 'lg' | 'xl'

const WIDTH_CLASS: Record<Width, string> = {
  sm: 'w-20 sm:w-24',
  md: 'w-24 sm:w-28',
  lg: 'w-28 sm:w-32',
  xl: 'w-32 sm:w-40',
}

interface MoneyProps {
  readonly value: number
  /** Fixed-width preset so a flex parent can't squeeze it. Omit for free flow. */
  readonly width?: Width
  /** Bold weight (font-semibold) instead of the default font-medium. */
  readonly bold?: boolean
  /** Render in muted-foreground (e.g. secondary totals, "Other" rollup rows). */
  readonly muted?: boolean
  /** Extra classes appended after the canonical set. */
  readonly className?: string
  /** Override the formatter (defaults to `formatCurrency` with user's currency prefs). */
  readonly formatter?: (value: number) => string
  /** Optional aria-label override; defaults to the formatted value itself. */
  readonly ariaLabel?: string
}

const Money = forwardRef<HTMLSpanElement, MoneyProps>(function Money(
  { value, width, bold = false, muted = false, className, formatter = formatCurrency, ariaLabel },
  ref,
) {
  const formatted = formatter(value)
  return (
    <span
      ref={ref}
      aria-label={ariaLabel ?? formatted}
      className={cn(
        // Canonical amount rules -- do not remove any of these.
        'shrink-0 text-right tabular-nums whitespace-nowrap',
        bold ? 'font-semibold' : 'font-medium',
        muted ? 'text-muted-foreground' : 'text-foreground',
        width ? WIDTH_CLASS[width] : '',
        className,
      )}
    >
      {formatted}
    </span>
  )
})

export default Money
