import { useId } from 'react'

import { Button, Input, Select } from '@/components/ui'
import { getTodayKey } from '@/lib/dateUtils'
import { formatDate } from '@/lib/formatters'
import { conversionRule } from '@/lib/rsuTaxFx'
import type { ForeignAssetEventKind, LotLedger } from '@/services/api/rsuTax'

import { formatShares } from '../foreignAssetsLabels'
import { useEventForm } from '../useEventForm'

const KINDS: Array<{ value: ForeignAssetEventKind; label: string }> = [
  { value: 'sale', label: 'Sale' },
  { value: 'dividend', label: 'Dividend' },
]

/** Record a sale from one vest, or a dividend with its US withholding, from the broker statement. */
export default function EventForm({ ledger, onDone }: Readonly<{ ledger: LotLedger; onDone: () => void }>) {
  const id = useId()
  const form = useEventForm(ledger, onDone)
  const { fields, isSale } = form
  const unit = form.currency ?? "stock's currency"
  const lotOptions = ledger.lots.map((lot) => ({
    value: lot.lot_id,
    label: `${lot.symbol} vest of ${formatDate(lot.acquired_on)} (${formatShares(lot.remaining_quantity)} held now)`,
  }))

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-[var(--overlay-1)] p-3"
      onSubmit={(event) => {
        event.preventDefault()
        form.submit()
      }}
    >
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1.5 text-sm font-medium text-text-secondary">Record a</legend>
        {KINDS.map((kind) => (
          <label
            key={kind.value}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:text-primary"
          >
            <input
              type="radio"
              name={`${id}-kind`}
              value={kind.value}
              checked={fields.kind === kind.value}
              onChange={() => form.update({ kind: kind.value })}
              className="accent-primary"
            />
            {kind.label}
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isSale ? (
          <Select
            id={`${id}-lot`}
            label="Sold from"
            options={lotOptions}
            value={fields.lotId}
            onChange={(event) => form.update({ lotId: event.target.value })}
          />
        ) : (
          <Select
            id={`${id}-symbol`}
            label="Paid by"
            options={ledger.symbols.map((symbol) => ({ value: symbol, label: symbol }))}
            value={fields.symbol}
            onChange={(event) => form.update({ symbol: event.target.value })}
          />
        )}
        <Input
          id={`${id}-date`}
          label={isSale ? 'Sale date' : 'Payment date'}
          type="date"
          value={fields.date}
          onChange={(event) => form.update({ date: event.target.value })}
        />
        {isSale && (
          <Input
            id={`${id}-quantity`}
            label="Shares sold (as on the broker statement)"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={fields.quantity}
            onChange={(event) => form.update({ quantity: event.target.value })}
          />
        )}
        <Input
          id={`${id}-gross`}
          label={isSale ? `Gross proceeds (${unit})` : `Gross dividend (${unit})`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={fields.gross}
          onChange={(event) => form.update({ gross: event.target.value })}
        />
        {!isSale && (
          <Input
            id={`${id}-withheld`}
            label={`Foreign tax withheld (${unit})`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={fields.withheld}
            onChange={(event) => form.update({ withheld: event.target.value })}
          />
        )}
        <Input
          id={`${id}-rate`}
          label="SBI TT buying rate (optional)"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.0001"
          value={fields.rate}
          onChange={(event) => form.update({ rate: event.target.value })}
        />
        <Input
          id={`${id}-rate-date`}
          label="Rate card date"
          type="date"
          max={getTodayKey()}
          value={form.rateDate}
          disabled={fields.rate.trim() === ''}
          onChange={(event) => form.update({ rateDate: event.target.value })}
        />
        <Input
          id={`${id}-notes`}
          label="Notes (optional)"
          value={fields.notes}
          maxLength={200}
          onChange={(event) => form.update({ notes: event.target.value })}
        />
      </div>
      {fields.date && (
        <p className="text-[11px] leading-5 text-muted-foreground">
          The rate for this {isSale ? 'sale' : 'dividend'} is SBI&apos;s TT buying rate on{' '}
          {formatDate(form.specifiedDate)} ({conversionRule(fields.date)}); if SBI published no
          card that day, use the last one before it. Leave the rate blank and the reports use the
          ECB rate of the day, an approximation. Amounts come from the broker
          statement{isSale ? '' : ' or Form 1042-S'}, in the stock&apos;s own currency.
        </p>
      )}
      {form.error && (
        <p role="alert" className="text-xs text-app-red">{form.error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" isLoading={form.saving}>
          Save {isSale ? 'sale' : 'dividend'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
