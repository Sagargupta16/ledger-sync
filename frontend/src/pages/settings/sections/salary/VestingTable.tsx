import { isVested } from '@/lib/rsuVesting'

import VestingCard from './VestingCard'
import VestingRow from './VestingRow'
import type { IndexedVesting, VestingTableProps } from './vestingTableTypes'

export type { VestingTableProps } from './vestingTableTypes'

function GroupDividerRow({ label, count }: Readonly<{ label: string; count: number }>) {
  return (
    <tr>
      <td colSpan={5} className="pb-1 pt-3">
        <span className="text-[11px] font-semibold uppercase text-muted-foreground">
          {label} ({count})
        </span>
      </td>
    </tr>
  )
}

/** Vesting schedule for one grant, grouped into vested and upcoming entries. */
export function VestingTable(props: Readonly<VestingTableProps>) {
  const { grant, today } = props
  const indexed: IndexedVesting[] = grant.vestings.map((vesting, stateIdx) => ({
    vesting,
    stateIdx,
  }))
  const vestedRows = indexed.filter((entry) => isVested(entry.vesting, today))
  const upcomingRows = indexed.filter((entry) => !isVested(entry.vesting, today))

  return (
    <>
      <div
        className="space-y-4 sm:hidden"
        aria-label={`Vesting schedule for ${grant.stock_name || 'RSU grant'}`}
      >
        {vestedRows.length > 0 && (
          <section aria-label={`Vested shares, ${vestedRows.length} entries`}>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              Vested ({vestedRows.length})
            </h3>
            <div className="space-y-2">
              {vestedRows.map((entry) => (
                <VestingCard
                  key={`${grant.id}-mobile-vesting-${entry.stateIdx}`}
                  {...props}
                  entry={entry}
                  vested
                />
              ))}
            </div>
          </section>
        )}

        {upcomingRows.length > 0 && (
          <section aria-label={`Upcoming shares, ${upcomingRows.length} entries`}>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              Upcoming ({upcomingRows.length})
            </h3>
            <div className="space-y-2">
              {upcomingRows.map((entry) => (
                <VestingCard
                  key={`${grant.id}-mobile-vesting-${entry.stateIdx}`}
                  {...props}
                  entry={entry}
                  vested={false}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table
          aria-label={`Vesting schedule for ${grant.stock_name || 'RSU grant'}`}
          className="w-full min-w-[32rem] text-sm"
        >
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                Date
              </th>
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                Qty
              </th>
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                Est. Value
              </th>
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                FY
              </th>
              <th scope="col" className="w-8 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {vestedRows.length > 0 && (
              <GroupDividerRow label="Vested" count={vestedRows.length} />
            )}
            {vestedRows.map((entry) => (
              <VestingRow
                key={`${grant.id}-vesting-${entry.stateIdx}`}
                {...props}
                entry={entry}
                vested
              />
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
    </>
  )
}
