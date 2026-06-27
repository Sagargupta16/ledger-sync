import { Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react'

import { formatCurrency } from '@/lib/formatters'
import type { RsuGrant, RsuVesting } from '@/types/salary'

import { FieldLabel } from '../../sectionPrimitives'
import { inputClass } from '../../styles'
import { dateToFY } from './fyHelpers'

interface RsuGrantsProps {
  grants: RsuGrant[]
  fetchingPriceFor: string | null
  rsuTotals: { shares: number; value: number }
  onAddGrant: () => void
  onRemoveGrant: (id: string) => void
  onUpdateGrant: (id: string, patch: Partial<RsuGrant>) => void
  onAddVesting: (grantId: string) => void
  onUpdateVesting: (grantId: string, vestIdx: number, patch: Partial<RsuVesting>) => void
  onRemoveVesting: (grantId: string, vestIdx: number) => void
  onFetchStockPrice: (grant: RsuGrant) => void
}

export function RsuGrants(props: Readonly<RsuGrantsProps>) {
  const {
    grants,
    fetchingPriceFor,
    rsuTotals,
    onAddGrant,
    onRemoveGrant,
    onUpdateGrant,
    onAddVesting,
    onUpdateVesting,
    onRemoveVesting,
    onFetchStockPrice,
  } = props

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">RSU Grants</h3>
        <button
          type="button"
          onClick={onAddGrant}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Grant
        </button>
      </div>

      {grants.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No RSU grants added yet. Click &quot;Add Grant&quot; to track stock-based compensation.
        </p>
      )}

      {grants.map((grant) => (
        <div
          key={grant.id}
          className="rounded-xl bg-white/[0.03] border border-border p-4 space-y-3"
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
                  <button
                    type="button"
                    onClick={() => onFetchStockPrice(grant)}
                    disabled={!grant.stock_name.trim() || fetchingPriceFor === grant.id}
                    title={
                      grant.stock_name.trim()
                        ? `Fetch latest price for ${grant.stock_name}`
                        : 'Enter stock name first'
                    }
                    className="shrink-0 p-2 rounded-lg border border-border text-muted-foreground hover:text-white hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {fetchingPriceFor === grant.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <FieldLabel htmlFor={`grant-notes-${grant.id}`}>Notes</FieldLabel>
                <input
                  id={`grant-notes-${grant.id}`}
                  type="text"
                  value={grant.notes ?? ''}
                  onChange={(e) =>
                    onUpdateGrant(grant.id, { notes: e.target.value || null })
                  }
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemoveGrant(grant.id)}
              className="p-2 rounded-lg text-app-red hover:bg-app-red/10 transition-colors mt-6"
              title="Delete grant"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {grant.vestings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-3 font-medium">Date</th>
                    <th className="text-left py-2 pr-3 font-medium">Qty</th>
                    <th className="text-left py-2 pr-3 font-medium">Est. Value</th>
                    <th className="text-left py-2 pr-3 font-medium">FY</th>
                    <th className="py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {grant.vestings.map((v, vi) => {
                    const estValue = v.quantity * grant.stock_price
                    const fy = v.date ? dateToFY(v.date) : ''
                    return (
                      <tr
                        key={`${grant.id}-${v.date}-${vi}`}
                        className="border-b border-border/50"
                      >
                        <td className="py-2 pr-3">
                          <input
                            type="date"
                            value={v.date}
                            onChange={(e) =>
                              onUpdateVesting(grant.id, vi, { date: e.target.value })
                            }
                            className={`${inputClass} max-w-[160px]`}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={v.quantity || ''}
                            onChange={(e) =>
                              onUpdateVesting(grant.id, vi, {
                                quantity: e.target.value === '' ? 0 : Number(e.target.value),
                              })
                            }
                            placeholder="0"
                            className={`${inputClass} max-w-[100px]`}
                          />
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {estValue > 0 ? formatCurrency(estValue) : '--'}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {fy ? `FY ${fy}` : '--'}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => onRemoveVesting(grant.id, vi)}
                            className="p-1 rounded text-app-red hover:bg-app-red/10 transition-colors"
                            title="Remove vesting"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={() => onAddVesting(grant.id)}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Vesting Date
          </button>
        </div>
      ))}

      {grants.length > 0 && rsuTotals.shares > 0 && (
        <div className="flex items-center gap-6 text-sm text-muted-foreground pt-1">
          <span>
            Total shares:{' '}
            <span className="text-white font-medium">{rsuTotals.shares.toLocaleString()}</span>
          </span>
          <span>
            Total value:{' '}
            <span className="text-white font-medium">{formatCurrency(rsuTotals.value)}</span>
          </span>
        </div>
      )}
    </div>
  )
}
