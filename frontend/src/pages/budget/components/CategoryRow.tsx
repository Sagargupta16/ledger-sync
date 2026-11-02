import { ChevronRight } from 'lucide-react'

import { Money } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import type { SpendingRuleCategoryRow } from '@/services/api/analyticsV2'

export type CategoryRowWithMeta = SpendingRuleCategoryRow & {
  readonly _isOther?: boolean
  readonly _rollup?: readonly SpendingRuleCategoryRow[]
}

interface RowProps {
  readonly row: CategoryRowWithMeta
  readonly isOther: boolean
  readonly expanded: boolean
  readonly onToggle?: () => void
}

/**
 * One category row: name + (up to 3) subcategory hints on the left,
 * monthly-average amount right-aligned. Amount NEVER truncates.
 *
 * Layout follows `CategoryBreakdown.tsx:167-201` -- flex row with flex-1/min-w-0
 * name block and shrink-0/text-right amount. Names wrap inside the flexible
 * column without ever compressing the amount cell.
 */
export function CategoryRow({ row, isOther, expanded, onToggle }: RowProps) {
  const subLine =
    !isOther && row.top_subs && row.top_subs.length > 0
      ? row.top_subs
          .filter((s) => s.name !== '(no subcategory)')
          .slice(0, 3)
          .map((s) => s.name)
          .join(' · ')
      : null

  const inner = (
    <div
      className={`flex min-h-11 items-center gap-2 rounded-md px-3 py-2 ${
        isOther ? 'transition-colors hover:bg-[var(--overlay-2)]' : ''
      }`}
    >
      {isOther && (
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        />
      )}

      <div className="flex-1 min-w-0">
        <div
          className={`break-words text-sm font-medium leading-5 ${
            isOther ? 'italic text-muted-foreground' : 'text-foreground'
          }`}
        >
          {row.category}
        </div>
        {subLine && (
          <div
            className="mt-0.5 line-clamp-2 break-words text-[11px] leading-4 text-muted-foreground"
            title={row.top_subs
              .map((s) => `${s.name} ${formatCurrency(s.amount)}`)
              .join('  ·  ')}
          >
            {subLine}
          </div>
        )}
      </div>

      {/* Amount: fixed width, whitespace-nowrap, tabular-nums, right-aligned.
          THIS is the single most important line -- never truncates the number.
          Codified into the shared <Money> primitive so future callers can't
          drop `whitespace-nowrap` and re-hit the "₹12,91" truncation bug. */}
      <Money value={row.avg_monthly} width="md" className="text-sm" muted={isOther} />
    </div>
  )

  if (isOther && onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.category}`}
        className="w-full rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        {inner}
      </button>
    )
  }

  return inner
}
