import { Plus, RefreshCw, Trash2 } from 'lucide-react'

import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/formatters'
import type { RsuGrant, RsuVesting } from '@/types/salary'

import { FieldLabel } from '../../sectionPrimitives'
import { inputClass } from '../../styles'
import { splitRsuTotals, todayKey } from '@/lib/rsuVesting'
import { VestingTable } from './VestingTable'

interface RsuGrantsProps {
  grants: RsuGrant[]
  fetchingPriceFor: string | null
  onAddGrant: () => void
  onRemoveGrant: (id: string) => void
  onUpdateGrant: (id: string, patch: Partial<RsuGrant>) => void
  onAddVesting: (grantId: string) => void
  onUpdateVesting: (grantId: string, vestIdx: number, patch: Partial<RsuVesting>) => void
  onRemoveVesting: (grantId: string, vestIdx: number) => void
  onSortVestings: (grantId: string) => void
  onFetchStockPrice: (grant: RsuGrant) => void
}

export function RsuGrants(props: Readonly<RsuGrantsProps>) {
  const {
    grants,
    fetchingPriceFor,
    onAddGrant,
    onRemoveGrant,
    onUpdateGrant,
    onAddVesting,
    onUpdateVesting,
    onRemoveVesting,
    onSortVestings,
    onFetchStockPrice,
  } = props

  const today = todayKey()
  const totals = splitRsuTotals(grants, today)
  const hasAnyShares = totals.vested.shares + totals.upcoming.shares > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">RSU Grants</h3>
        <Button
          id="add-rsu-grant"
          type="button"
          variant="secondary"
          size="sm"
          onClick={onAddGrant}
          className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          Add Grant
        </Button>
      </div>

      {grants.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No RSU grants added yet. Click &quot;Add Grant&quot; to track stock-based compensation.
        </p>
      )}

      {grants.map((grant) => (
        <div
          key={grant.id}
          className="rounded-xl bg-[var(--overlay-1)] border border-border p-4 space-y-3"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor={`grant-stock-${grant.id}`}>Stock Name</FieldLabel>
                <input
                  id={`grant-stock-${grant.id}`}
                  type="text"
                  value={grant.stock_name}
                  onChange={(e) => onUpdateGrant(grant.id, { stock_name: e.target.value })}
                  placeholder="e.g. AAPL"
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor={`grant-price-${grant.id}`}>Price / Share</FieldLabel>
                <div className="flex gap-1.5">
                  <input
                    id={`grant-price-${grant.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={grant.stock_price || ''}
                    onChange={(e) =>
                      onUpdateGrant(grant.id, {
                        stock_price: e.target.value === '' ? 0 : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                    className={inputClass}
                  />
                  <Button
                    id={`fetch-stock-price-${grant.id}`}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onFetchStockPrice(grant)}
                    disabled={!grant.stock_name.trim() || fetchingPriceFor === grant.id}
                    isLoading={fetchingPriceFor === grant.id}
                    aria-label={`Fetch latest price for ${grant.stock_name || 'this grant'}`}
                    title={
                      grant.stock_name.trim()
                        ? `Fetch latest price for ${grant.stock_name}`
                        : 'Enter stock name first'
                    }
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    icon={<RefreshCw className="w-4 h-4" />}
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor={`grant-notes-${grant.id}`}>Notes</FieldLabel>
                <input
                  id={`grant-notes-${grant.id}`}
                  type="text"
                  value={grant.notes ?? ''}
                  onChange={(e) => onUpdateGrant(grant.id, { notes: e.target.value || null })}
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>
            </div>
            <Button
              id={`delete-rsu-grant-${grant.id}`}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemoveGrant(grant.id)}
              className="mt-6 text-app-red hover:bg-app-red/10 hover:text-app-red"
              title="Delete grant"
              aria-label={`Delete ${grant.stock_name || 'RSU'} grant`}
              icon={<Trash2 className="w-4 h-4" />}
            />
          </div>

          {grant.vestings.length > 0 && (
            <VestingTable
              grant={grant}
              today={today}
              onUpdateVesting={onUpdateVesting}
              onRemoveVesting={onRemoveVesting}
              onSortVestings={onSortVestings}
            />
          )}

          <Button
            id={`add-vesting-${grant.id}`}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAddVesting(grant.id)}
            className="text-primary hover:text-primary/80"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Vesting Date
          </Button>
        </div>
      ))}

      {grants.length > 0 && hasAnyShares && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground pt-1">
          <span>
            Vested:{' '}
            <span className="text-foreground font-medium">
              {totals.vested.shares.toLocaleString()} shares
            </span>
            {totals.vested.value > 0 && (
              <span className="text-app-green font-medium">
                {' '}
                ({formatCurrency(totals.vested.value)})
              </span>
            )}
          </span>
          <span>
            Upcoming:{' '}
            <span className="text-foreground font-medium">
              {totals.upcoming.shares.toLocaleString()} shares
            </span>
            {totals.upcoming.value > 0 && (
              <span className="text-foreground font-medium">
                {' '}
                ({formatCurrency(totals.upcoming.value)})
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
