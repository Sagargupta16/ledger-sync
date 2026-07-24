import { X } from 'lucide-react'

import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/formatters'
import type { RsuGrant, RsuVesting } from '@/types/salary'

import { inputClass } from '../../styles'
import { dateToFY } from './fyHelpers'
import { isVested, vestingPrice } from '@/lib/rsuVesting'

export interface VestingTableProps {
  grant: RsuGrant
  today: string
  onUpdateVesting: (grantId: string, vestIdx: number, patch: Partial<RsuVesting>) => void
  onRemoveVesting: (grantId: string, vestIdx: number) => void
  onSortVestings: (grantId: string) => void
}

interface IndexedVesting {
  vesting: RsuVesting
  /** Index into the grant's state array -- edit handlers are index-based. */
  stateIdx: number
}

function GroupDividerRow({ label, count }: Readonly<{ label: string; count: number }>) {
  return (
    <tr>
      <td colSpan={5} className="pt-3 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label} ({count})
        </span>
      </td>
    </tr>
  )
}

function VestingRow({
  grant,
  entry,
  today,
  vested,
  onUpdateVesting,
  onRemoveVesting,
  onSortVestings,
}: Readonly<
  Pick<VestingTableProps, 'grant' | 'today' | 'onUpdateVesting' | 'onRemoveVesting' | 'onSortVestings'> & {
    entry: IndexedVesting
    vested: boolean
  }
>) {
  const { vesting: v, stateIdx } = entry
  const price = vestingPrice(grant, v, today)
  const estValue = v.quantity * price
  const fy = v.date ? dateToFY(v.date) : ''
  const usesVestPrice = vested && v.price_at_vest != null && v.price_at_vest > 0
  const rowName = `${grant.stock_name || 'RSU'} vesting ${stateIdx + 1}`
  const dateId = `vesting-${grant.id}-${stateIdx}-date`
  const quantityId = `vesting-${grant.id}-${stateIdx}-quantity`

  return (
    <tr className={`border-b border-border/50 ${vested ? 'opacity-75' : ''}`}>
      <td className="py-2 pr-3">
        <label htmlFor={dateId} className="sr-only">
          Date for {rowName}
        </label>
        <input
          id={dateId}
          type="date"
          value={v.date}
          onChange={(e) => onUpdateVesting(grant.id, stateIdx, { date: e.target.value })}
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
          value={v.quantity || ''}
          onChange={(e) =>
            onUpdateVesting(grant.id, stateIdx, {
              quantity: e.target.value === '' ? 0 : Number(e.target.value),
            })
          }
          placeholder="0"
          className={`${inputClass} max-w-[100px]`}
        />
      </td>
      <td
        className="py-2 pr-3 text-muted-foreground"
        title={
          usesVestPrice
            ? `Valued at vest-date price ${formatCurrency(price)}`
            : 'Valued at current price'
        }
      >
        {estValue > 0 ? formatCurrency(estValue) : '--'}
      </td>
      <td className="py-2 pr-3 text-muted-foreground">{fy ? `FY ${fy}` : '--'}</td>
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
          <X className="w-3.5 h-3.5" />
        </Button>
      </td>
    </tr>
  )
}

/** Vesting schedule table for one grant, grouped into Vested / Upcoming. */
export function VestingTable(props: Readonly<VestingTableProps>) {
  const { grant, today } = props

  const indexed: IndexedVesting[] = grant.vestings.map((vesting, stateIdx) => ({
    vesting,
    stateIdx,
  }))
  const vestedRows = indexed.filter((e) => isVested(e.vesting, today))
  const upcomingRows = indexed.filter((e) => !isVested(e.vesting, today))

  return (
    <div className="overflow-x-auto">
      <table
        aria-label={`Vesting schedule for ${grant.stock_name || 'RSU grant'}`}
        className="w-full min-w-[32rem] text-sm"
      >
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border">
            <th scope="col" className="text-left py-2 pr-3 font-medium">Date</th>
            <th scope="col" className="text-left py-2 pr-3 font-medium">Qty</th>
            <th scope="col" className="text-left py-2 pr-3 font-medium">Est. Value</th>
            <th scope="col" className="text-left py-2 pr-3 font-medium">FY</th>
            <th scope="col" className="py-2 w-8">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {vestedRows.length > 0 && <GroupDividerRow label="Vested" count={vestedRows.length} />}
          {vestedRows.map((entry) => (
            <VestingRow key={`${grant.id}-vesting-${entry.stateIdx}`} {...props} entry={entry} vested />
          ))}
          {upcomingRows.length > 0 && (
            <GroupDividerRow label="Upcoming" count={upcomingRows.length} />
          )}
          {upcomingRows.map((entry) => (
            <VestingRow
              key={`${grant.id}-vesting-${entry.stateIdx}`}
              {...props}
              entry={entry}
              vested={false}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
