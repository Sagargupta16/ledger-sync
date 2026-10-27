import { useId, useState } from 'react'

import { Button, Select } from '@/components/ui'
import { useLinkForeignAssetEvent } from '@/hooks/api/useRsuTax'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { formatDate } from '@/lib/formatters'
import { formatQuote } from '@/lib/rsuTaxFx'
import type { ForeignAssetEvent, LotLedger } from '@/services/api/rsuTax'

import { formatShares } from '../foreignAssetsLabels'

interface EventLinkFormProps {
  ledger: LotLedger
  event: ForeignAssetEvent
  onDone: () => void
}

/** Point a sale at the vest it came from, or a dividend at the stock that paid it. */
export default function EventLinkForm({ ledger, event, onDone }: Readonly<EventLinkFormProps>) {
  const id = useId()
  const link = useLinkForeignAssetEvent()
  const isSale = event.kind === 'sale'
  const options = isSale
    ? ledger.lots
        .filter((lot) => lot.acquired_on <= event.event_date)
        .map((lot) => ({ value: lot.lot_id, label: `${lot.symbol} vest of ${formatDate(lot.acquired_on)}` }))
    : ledger.symbols.map((symbol) => ({ value: symbol, label: symbol }))
  const [choice, setChoice] = useState(options[0]?.value ?? '')
  const [error, setError] = useState<string | null>(null)
  const amount = formatQuote(event.gross_amount, event.currency)
  const what = isSale
    ? `the sale of ${formatDate(event.event_date)} (${formatShares(event.quantity ?? 0)} shares, ${amount})`
    : `the dividend of ${formatDate(event.event_date)} (${amount})`

  function submit() {
    if (!choice) return
    setError(null)
    link.mutate(
      { eventId: event.id, link: isSale ? { lot_id: choice } : { symbol: choice } },
      {
        onSuccess: onDone,
        onError: (failure) => setError(getApiErrorMessage(failure, 'Could not save. Try again.')),
      },
    )
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-[var(--overlay-1)] p-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault()
        submit()
      }}
    >
      <p className="text-sm font-medium text-foreground">
        {isSale ? 'Link' : 'Change the stock of'} {what}
      </p>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isSale
            ? `No vest on or before ${formatDate(event.event_date)}. Add it in Settings, or delete this sale.`
            : 'No RSU grant uses a stock yet. Add the grant in Settings, or delete this dividend.'}
        </p>
      ) : (
        <Select
          id={`${id}-target`}
          label={isSale ? 'Sold from' : 'Paid by'}
          options={options}
          value={choice}
          onChange={(change) => setChoice(change.target.value)}
        />
      )}
      {error && <p role="alert" className="text-xs text-app-red">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" isLoading={link.isPending} disabled={!choice}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
