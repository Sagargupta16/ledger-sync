import { X } from 'lucide-react'

import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/formatters'
import { vestingPrice } from '@/lib/rsuVesting'

import { inputClass } from '../../styles'
import { dateToFY } from './fyHelpers'
import type { VestingEntryProps } from './vestingTableTypes'

export default function VestingCard({
  grant,
  entry,
  today,
  vested,
  onUpdateVesting,
  onRemoveVesting,
  onSortVestings,
}: Readonly<VestingEntryProps>) {
  const { vesting, stateIdx } = entry
  const price = vestingPrice(grant, vesting, today)
  const estimatedValue = vesting.quantity * price
  const fiscalYear = vesting.date ? dateToFY(vesting.date) : ''
  const usesVestPrice = vested && vesting.price_at_vest != null && vesting.price_at_vest > 0
  const rowName = `${grant.stock_name || 'RSU'} vesting ${stateIdx + 1}`
  const dateId = `mobile-vesting-${grant.id}-${stateIdx}-date`
  const quantityId = `mobile-vesting-${grant.id}-${stateIdx}-quantity`
  const headingId = `mobile-vesting-${grant.id}-${stateIdx}-heading`
  const valuationId = `mobile-vesting-${grant.id}-${stateIdx}-valuation`

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-lg border border-border bg-[var(--overlay-1)] p-3"
    >
      <h4 id={headingId} className="sr-only">
        {rowName}
      </h4>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {vested ? 'Vested' : 'Upcoming'}
          </p>
          <p className="text-xs text-muted-foreground">
            {fiscalYear ? `FY ${fiscalYear}` : 'Fiscal year pending'}
          </p>
        </div>
        <Button
          id={`remove-mobile-vesting-${grant.id}-${stateIdx}`}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemoveVesting(grant.id, stateIdx)}
          className="text-app-red hover:bg-app-red/10 hover:text-app-red"
          title="Remove vesting"
          aria-label={`Remove ${rowName}`}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <label htmlFor={dateId} className="space-y-1 text-xs font-medium text-text-secondary">
          <span>
            Date<span className="sr-only"> for {rowName}</span>
          </span>
          <input
            id={dateId}
            type="date"
            value={vesting.date}
            onChange={(event) =>
              onUpdateVesting(grant.id, stateIdx, { date: event.target.value })
            }
            onBlur={() => onSortVestings(grant.id)}
            className={inputClass}
          />
        </label>
        <label
          htmlFor={quantityId}
          className="space-y-1 text-xs font-medium text-text-secondary"
        >
          <span>
            Quantity<span className="sr-only"> for {rowName}</span>
          </span>
          <input
            id={quantityId}
            type="number"
            inputMode="decimal"
            min="0"
            value={vesting.quantity || ''}
            onChange={(event) =>
              onUpdateVesting(grant.id, stateIdx, {
                quantity: event.target.value === '' ? 0 : Number(event.target.value),
              })
            }
            placeholder="0"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-[var(--overlay-2)] px-3 py-2">
        <span className="text-xs text-muted-foreground">Estimated value</span>
        <span className="text-right">
          <span
            className="ledger-figure block text-sm font-semibold text-foreground"
            aria-describedby={valuationId}
          >
            {estimatedValue > 0 ? formatCurrency(estimatedValue) : '--'}
          </span>
          <span id={valuationId} className="mt-0.5 block text-[11px] text-muted-foreground">
            {usesVestPrice ? `Vest-date price ${formatCurrency(price)}` : 'Current price'}
          </span>
        </span>
      </div>
    </article>
  )
}
