import { formatCurrency, getActiveLocale } from '@/lib/formatters'
import type { RsuSplitTotals } from '@/lib/rsuVesting'

/** Received (after-tax) and gross share totals for vested or upcoming RSUs. */
export function ReceivedTotal({
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
