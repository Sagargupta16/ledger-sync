import { X } from 'lucide-react'

import Button from '@/components/ui/Button'
import { formatCurrency, getActiveLocale } from '@/lib/formatters'
import { grossVestingValue, hasLockedVestingPrice, netVestingQuantity, netVestingValue, vestingPrice } from '@/lib/rsuVesting'
import { selectFiscalYearStartMonth, usePreferencesStore } from '@/store/preferencesStore'

import { inputClass } from '../../styles'
import { dateToFY } from './fyHelpers'
import type { VestingEntryProps } from './vestingTableTypes'

export default function VestingRow({
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
  const dateId = `vesting-${grant.id}-${stateIdx}-date`
  const quantityId = `vesting-${grant.id}-${stateIdx}-quantity`
  const netQuantityId = `vesting-${grant.id}-${stateIdx}-net-quantity`
  const netHintId = `${netQuantityId}-hint`
  const isEstimate = vesting.net_quantity == null
  const netQuantity = netVestingQuantity(vesting)
  const netValue = netVestingValue(vesting, price)

  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-3">
        <label htmlFor={dateId} className="sr-only">
          Date for {rowName}
        </label>
        <input
          id={dateId}
          type="date"
          value={vesting.date}
          onChange={(event) =>
            onUpdateVesting(grant.id, stateIdx, { date: event.target.value })
          }
          onBlur={() => onSortVestings(grant.id)}
          className={`${inputClass} max-w-[160px]`}
        />
      </td>
      <td className="py-2 pr-3">
        <label htmlFor={quantityId} className="sr-only">
          Gross granted quantity for {rowName}
        </label>
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
          className={`${inputClass} max-w-[100px]`}
        />
      </td>
      <td className="py-2 pr-3">
        <label htmlFor={netQuantityId} className="sr-only">
          Actual shares received after tax for {rowName}
        </label>
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
          title="Leave blank to use the withholding estimate. Enter actual credited units, including 0 for full withholding."
          className={`${inputClass} max-w-[100px]`}
        />
        <span id={netHintId} className="mt-1 block text-[11px] text-text-tertiary">
          {isEstimate ? 'Estimated units' : 'Actual units'}
        </span>
      </td>
      <td className="py-2 pr-3 text-muted-foreground">
        <span className="ledger-figure block text-app-green">
          {price > 0 ? formatCurrency(netValue) : '--'}
        </span>
        <span className="block text-[11px] text-text-tertiary">
          Gross {price > 0 ? formatCurrency(grossValue) : '--'}
        </span>
        <span className="block text-[11px] text-text-tertiary">
          {usesVestPrice ? `Vest-date ${formatCurrency(price)}` : 'Current price estimate'}
        </span>
        {vested && !usesVestPrice && (
          <span className="block text-[11px] text-text-tertiary">Vest-date price missing</span>
        )}
      </td>
      <td className="py-2 pr-3 text-muted-foreground">
        {fiscalYear ? `FY ${fiscalYear}` : '--'}
      </td>
      <td className="py-2">
        <Button
          id={`remove-vesting-${grant.id}-${stateIdx}`}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemoveVesting(grant.id, stateIdx)}
          className="text-app-red hover:bg-app-red/10 hover:text-app-red"
          title="Remove vesting"
          aria-label={`Remove ${rowName}`}
        >
          <X className="size-3.5" />
        </Button>
      </td>
    </tr>
  )
}
