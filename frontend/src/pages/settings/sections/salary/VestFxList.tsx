import { useId, useMemo, useState } from 'react'

import { ExternalLink } from 'lucide-react'

import Button from '@/components/ui/Button'
import { BASE_CURRENCY } from '@/constants/currencies'
import { useVestFx } from '@/hooks/api/useRsuTax'
import { SBI_RATE_ARCHIVE_URL } from '@/lib/rsuTaxFx'
import type { VestFx } from '@/services/api/rsuTax'
import { selectDisplayCurrency, usePreferencesStore } from '@/store/preferencesStore'
import type { RsuGrant, RsuVesting } from '@/types/salary'

import VestFxRow from './VestFxRow'

interface VestFxListProps {
  grant: RsuGrant
  /** Vested vests that already have a stored ID. */
  vestings: RsuVesting[]
  unsavedCount: number
}

/** Source and rupee difference per vest, with an editor for the conversion inputs. */
export default function VestFxList({ grant, vestings, unsavedCount }: Readonly<VestFxListProps>) {
  const headingId = useId()
  const records = useVestFx()
  // Vest prices are fetched in the display currency, so they stand in for rupees only in INR.
  const displayCurrency = usePreferencesStore(selectDisplayCurrency)
  const pricesInInr = displayCurrency === BASE_CURRENCY
  const [editingId, setEditingId] = useState<string | null>(null)
  const byVest = useMemo(
    () => new Map<string, VestFx>((records.data ?? []).map((record) => [record.vesting_id, record])),
    [records.data],
  )

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border border-border bg-[var(--overlay-1)] p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 id={headingId} className="text-xs font-semibold text-foreground">
          Tax value per vest (INR)
        </h4>
        <a
          href={SBI_RATE_ARCHIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-xs text-primary hover:underline lg:pointer-fine:min-h-0"
        >
          Past SBI rate cards
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The employer&apos;s perquisite figure governs when entered. Otherwise enter SBI&apos;s TT
        buying rate for the last day of the month before the vest month; until then the vest is
        valued at the ECB rate, an approximation. A computation aid, not tax advice.
      </p>
      {!pricesInInr && (
        <p className="text-[11px] leading-relaxed text-app-orange">
          Your display currency is {displayCurrency}, so the vest prices above are saved in{' '}
          {displayCurrency}, not rupees, and the ECB approximation is not shown. Enter the
          employer&apos;s figure or an SBI TT buying rate for each vest.
        </p>
      )}

      {records.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-app-red">
          <span>Saved exchange rates could not be loaded, so ECB values are shown.</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void records.refetch()}>
            Retry
          </Button>
        </div>
      )}

      <ul className="space-y-2" aria-busy={records.isLoading || undefined}>
        {vestings.map((vesting) => {
          const vestingId = vesting.id ?? ''
          return (
            <VestFxRow
              key={vestingId}
              grant={grant}
              vesting={vesting}
              fx={byVest.get(vestingId)}
              editing={editingId === vestingId}
              canEdit={records.isSuccess}
              onToggle={() => setEditingId((current) => (current === vestingId ? null : vestingId))}
              onDone={() => setEditingId(null)}
              pricesInInr={pricesInInr}
            />
          )
        })}
      </ul>

      {unsavedCount > 0 && (
        <p className="text-[11px] text-text-tertiary">
          {unsavedCount === 1
            ? 'Save settings to record the tax exchange rate for the new vest.'
            : `Save settings to record the tax exchange rate for the ${unsavedCount} new vests.`}
        </p>
      )}
    </section>
  )
}
