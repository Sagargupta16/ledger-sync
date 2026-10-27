import Button from '@/components/ui/Button'
import { needsHistoricalVestingPrice } from '@/lib/rsuVesting'
import type { RsuGrant } from '@/types/salary'

import type { RsuPriceStatus } from './useRsuPrices'

/** "Fetch vest-date prices" for a grant whose past vests have no locked price, and its status. */
export function HistoricalPriceAction({
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
