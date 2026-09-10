import { X } from 'lucide-react'

import Button from '@/components/ui/Button'
import { formatCurrency, getActiveLocale } from '@/lib/formatters'
import { grossVestingValue, hasLockedVestingPrice, netVestingQuantity, netVestingValue, vestingPrice } from '@/lib/rsuVesting'
import { selectFiscalYearStartMonth, usePreferencesStore } from '@/store/preferencesStore'

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
  const fyStartMonth = usePreferencesStore(selectFiscalYearStartMonth)
  const price = vestingPrice(grant, vesting, today)
  const grossValue = grossVestingValue(vesting, price)
  const fiscalYear = vesting.date ? dateToFY(vesting.date, fyStartMonth) : ''
  const usesVestPrice = hasLockedVestingPrice(vesting, today)
  const rowName = `${grant.stock_name || 'RSU'} vesting ${stateIdx + 1}`
  const dateId = `mobile-vesting-${grant.id}-${stateIdx}-date`
  const quantityId = `mobile-vesting-${grant.id}-${stateIdx}-quantity`
  const netQuantityId = `mobile-vesting-${grant.id}-${stateIdx}-net-quantity`
  const headingId = `mobile-vesting-${grant.id}-${stateIdx}-heading`
  const valuationId = `mobile-vesting-${grant.id}-${stateIdx}-valuation`
  const netHintId = `${netQuantityId}-hint`
  const isEstimate = vesting.net_quantity == null
  const netQuantity = netVestingQuantity(vesting)
  const netValue = netVestingValue(vesting, price)

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
            Gross granted qty<span className="sr-only"> for {rowName}</span>
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
        <label
          htmlFor={netQuantityId}
          className="space-y-1 text-xs font-medium text-text-secondary"
        >
          <span>
            Actual received units<span className="sr-only"> for {rowName}</span>
          </span>
          <input
            id={netQuantityId}
            type="number"
            inputMode="decimal"
            min="0"
            max={vesting.quantity}
            step="any"
            value={vesting.net_quantity ?? ''}
            onChange={(event) =>
              onUpdateVesting(grant.id, stateIdx, {
                net_quantity: event.target.value === '' ? null : Number(event.target.value),
              })
            }
            placeholder={netQuantity.toLocaleString(getActiveLocale(), {
              maximumFractionDigits: 6,
              useGrouping: false,
            })}
            aria-describedby={netHintId}
            className={inputClass}
          />
          <span id={netHintId} className="block text-[11px] font-normal text-text-tertiary">
            {isEstimate ? 'Estimated units; enter actuals to override' : 'Actual units override the estimate'}
          </span>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-[var(--overlay-2)] px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {isEstimate || !usesVestPrice ? 'Estimated after-tax value' : 'Received value'}
        </span>
        <span className="text-right">
          <span
            className="ledger-figure block text-sm font-semibold text-app-green"
            aria-describedby={valuationId}
          >
            {price > 0 ? formatCurrency(netValue) : '--'}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Gross {price > 0 ? formatCurrency(grossValue) : '--'}
          </span>
          <span id={valuationId} className="mt-0.5 block text-[11px] text-muted-foreground">
            {usesVestPrice ? `Vest-date price ${formatCurrency(price)}` : 'Current price estimate'}
          </span>
          {vested && !usesVestPrice && (
            <span className="block text-[11px] text-text-tertiary">Vest-date price missing</span>
          )}
        </span>
      </div>
    </article>
  )
}
