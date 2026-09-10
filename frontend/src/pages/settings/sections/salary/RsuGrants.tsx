import { Plus, RefreshCw, Trash2 } from 'lucide-react'

import Button from '@/components/ui/Button'
import { formatCurrency, getActiveLocale } from '@/lib/formatters'
import {
  DEFAULT_RSU_CESS_PERCENT,
  DEFAULT_RSU_TAX_PERCENT,
  needsHistoricalVestingPrice,
  splitRsuTotals,
  todayKey,
  type RsuSplitTotals,
} from '@/lib/rsuVesting'
import type { RsuGrant, RsuVesting } from '@/types/salary'

import { FieldLabel } from '../../sectionPrimitives'
import { inputClass } from '../../styles'
import { VestingTable } from './VestingTable'
import type { RsuPriceStatus } from './useRsuPrices'

function ReceivedTotal({
  label,
  totals,
}: Readonly<{ label: string; totals: RsuSplitTotals['vested'] }>) {
  const quantityOptions = { maximumFractionDigits: 6 }
  let source = 'Actual units'
  if (totals.hasEstimates) source = 'Includes estimated units'
  if (totals.shares === 0) source = 'No vestings'

  return (
    <div className="min-w-0 rounded-lg border border-border bg-[var(--overlay-1)] p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="ledger-figure mt-1 text-lg font-semibold text-foreground">
        {totals.receivedShares.toLocaleString(getActiveLocale(), quantityOptions)} shares
      </p>
      <p className="ledger-figure text-sm text-app-green">
        {totals.value > 0 ? formatCurrency(totals.receivedValue) : '--'}
      </p>
      <p className="mt-1 text-[11px] text-text-tertiary">{source}</p>
      {totals.hasEstimatedPrices && (
        <p className="text-[11px] text-text-tertiary">Includes values estimated at current prices</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Gross: {totals.shares.toLocaleString(getActiveLocale(), quantityOptions)} shares
        {totals.value > 0 && ` (${formatCurrency(totals.value)})`}
      </p>
    </div>
  )
}

function HistoricalPriceAction({
  grant, today, busy, fetching, status, onFetch,
}: Readonly<{
  grant: RsuGrant
  today: string
  busy: boolean
  fetching: boolean
  status?: RsuPriceStatus
  onFetch: (grant: RsuGrant) => void
}>) {
  const missingPrice = grant.vestings.some((vesting) => needsHistoricalVestingPrice(vesting, today))
  return (
    <>
      {missingPrice && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || !grant.stock_name.trim()}
            isLoading={fetching}
            onClick={() => onFetch(grant)}
          >
            Fetch vest-date prices
          </Button>
          <p className="text-xs text-muted-foreground">
            Past entries without a locked price use current-price estimates.
          </p>
        </div>
      )}
      {status && (
        <output
          className={`block text-xs ${status.kind === 'error' ? 'text-app-red' : 'text-muted-foreground'}`}
          aria-live="polite"
        >
          {status.message}
        </output>
      )}
    </>
  )
}

interface RsuGrantsProps {
  grants: RsuGrant[]
  fetchingPriceFor: string | null
  fetchingVestPricesFor: string | null
  priceStatusByGrant: Record<string, RsuPriceStatus | undefined>
  onAddGrant: () => void
  onRemoveGrant: (id: string) => void
  onUpdateGrant: (id: string, patch: Partial<RsuGrant>) => void
  onAddVesting: (grantId: string) => void
  onUpdateVesting: (grantId: string, vestIdx: number, patch: Partial<RsuVesting>) => void
  onRemoveVesting: (grantId: string, vestIdx: number) => void
  onSortVestings: (grantId: string) => void
  onFetchStockPrice: (grant: RsuGrant) => void
  onFetchVestPrices: (grant: RsuGrant) => void
}

export function RsuGrants(props: Readonly<RsuGrantsProps>) {
  const {
    grants,
    fetchingPriceFor,
    fetchingVestPricesFor,
    priceStatusByGrant,
    onAddGrant,
    onRemoveGrant,
    onUpdateGrant,
    onAddVesting,
    onUpdateVesting,
    onRemoveVesting,
    onSortVestings,
    onFetchStockPrice,
    onFetchVestPrices,
  } = props

  const today = todayKey()
  const totals = splitRsuTotals(grants, today)
  const hasAnyShares = totals.vested.shares + totals.upcoming.shares > 0
  const priceBusy = fetchingPriceFor !== null || fetchingVestPricesFor !== null

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

      <p className="text-xs leading-relaxed text-muted-foreground">
        Enter gross granted units. After-tax estimates use {DEFAULT_RSU_TAX_PERCENT}% tax plus{' '}
        {DEFAULT_RSU_CESS_PERCENT}% cess on that tax, excluding surcharge. Enter actual received
        units to override an estimate, or the gross quantity if nothing was withheld.
        Tax projections use the full gross vest value.
      </p>

      {hasAnyShares && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ReceivedTotal label="Vested after tax" totals={totals.vested} />
          <ReceivedTotal label="Upcoming after tax" totals={totals.upcoming} />
        </div>
      )}

      {grants.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No RSU grants added yet. Click &quot;Add Grant&quot; to track stock-based compensation.
        </p>
      )}

      {grants.map((grant) => (
        <div
          key={grant.id}
          className="space-y-3 border-t border-border pt-4"
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
                    disabled={!grant.stock_name.trim() || priceBusy}
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

          <HistoricalPriceAction
            grant={grant}
            today={today}
            busy={priceBusy}
            fetching={fetchingVestPricesFor === grant.id}
            status={priceStatusByGrant[grant.id]}
            onFetch={onFetchVestPrices}
          />

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

    </div>
  )
}
