import { X } from 'lucide-react'

import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/formatters'
import { netVestingValue, vestingPrice } from '@/lib/rsuVesting'
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
  const estimatedValue = vesting.quantity * price
  const fiscalYear = vesting.date ? dateToFY(vesting.date, fyStartMonth) : ''
  const usesVestPrice = vested && vesting.price_at_vest != null && vesting.price_at_vest > 0
  const rowName = `${grant.stock_name || 'RSU'} vesting ${stateIdx + 1}`
  const dateId = `vesting-${grant.id}-${stateIdx}-date`
  const quantityId = `vesting-${grant.id}-${stateIdx}-quantity`
  const netQuantityId = `vesting-${grant.id}-${stateIdx}-net-quantity`
  // Only shown when the user recorded a post-withholding count. Priced at the
  // same per-share figure as the gross line so the two are comparable.
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
          Quantity for {rowName}
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
          Shares received after tax for {rowName}
        </label>
        <input
          id={netQuantityId}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.001"
          value={vesting.net_quantity ?? ''}
          onChange={(event) =>
            onUpdateVesting(grant.id, stateIdx, {
              net_quantity: event.target.value === '' ? null : Number(event.target.value),
            })
          }
          placeholder="--"
          title="Shares credited after sell-to-cover withholding. Leave blank if none was withheld."
          className={`${inputClass} max-w-[100px]`}
        />
      </td>
      <td className="py-2 pr-3 text-muted-foreground">
        <span className="ledger-figure block">
          {estimatedValue > 0 ? formatCurrency(estimatedValue) : '--'}
        </span>
        <span className="block text-[11px] text-text-tertiary">
          {usesVestPrice ? `Vest-date ${formatCurrency(price)}` : 'Current price'}
        </span>
        {netValue !== null && (
          <span className="block text-[11px] text-app-green">
            {formatCurrency(netValue)} received
          </span>
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
