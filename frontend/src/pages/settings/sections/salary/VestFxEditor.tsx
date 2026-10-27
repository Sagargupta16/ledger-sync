import Button from '@/components/ui/Button'
import Money from '@/components/ui/Money'
import { formatDate } from '@/lib/formatters'
import { FX_SOURCE_LABEL, SBI_RATE_ARCHIVE_URL, SBI_RATE_CARD_URL, formatInr } from '@/lib/rsuTaxFx'
import { todayKey } from '@/lib/rsuVesting'
import type { VestFx } from '@/services/api/rsuTax'
import type { RsuGrant, RsuVesting } from '@/types/salary'

import { FieldHint, FieldLabel } from '@/pages/settings/sectionPrimitives'
import { inputClass } from '@/pages/settings/styles'
import { useVestFxForm } from './useVestFxForm'

interface VestFxEditorProps {
  grant: RsuGrant
  vesting: RsuVesting
  fx: VestFx | undefined
  onDone: () => void
  /** False when the display currency is not INR, so saved vest prices are not rupees. */
  pricesInInr: boolean
}

const linkClass = 'text-primary underline-offset-2 hover:underline'

/** Inputs for one vest's conversion. Saving writes at once, apart from the Settings save. */
export default function VestFxEditor({ grant, vesting, fx, onDone, pricesInInr }: Readonly<VestFxEditorProps>) {
  const form = useVestFxForm(vesting, fx, onDone, pricesInInr)
  const idBase = `vest-fx-${vesting.id ?? 'new'}`
  const { preview } = form

  return (
    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${idBase}-employer`}>Employer perquisite (INR)</FieldLabel>
          <input
            id={`${idBase}-employer`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.fields.employer}
            onChange={(event) => form.update({ employer: event.target.value })}
            placeholder="Optional"
            className={inputClass}
          />
          <FieldHint>For the whole vest, from Form 16 / 12BA or the payslip. Governs when entered.</FieldHint>
        </div>
        <div>
          <FieldLabel htmlFor={`${idBase}-price`}>Price per share on the vest date ({form.currency})</FieldLabel>
          <div className="flex gap-1.5">
            <input
              id={`${idBase}-price`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.0001"
              value={form.fields.quotePrice}
              onChange={(event) => form.update({ quotePrice: event.target.value })}
              placeholder="0.00"
              className={inputClass}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void form.fetchClose()}
              isLoading={form.fetching}
              disabled={!grant.stock_name.trim()}
              className="shrink-0"
            >
              Fetch close
            </Button>
          </div>
          <FieldHint>The fair market value on the vest confirmation, before any later split.</FieldHint>
        </div>
        <div>
          <FieldLabel htmlFor={`${idBase}-rate`}>SBI TT buying rate (INR per {form.currency})</FieldLabel>
          <input
            id={`${idBase}-rate`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.0001"
            value={form.fields.rate}
            onChange={(event) => form.update({ rate: event.target.value })}
            placeholder="Optional"
            className={inputClass}
          />
          <FieldHint>
            From SBI&apos;s rate card:{' '}
            <a href={SBI_RATE_ARCHIVE_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              past cards
            </a>
            {', '}
            <a href={SBI_RATE_CARD_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              today&apos;s card
            </a>
            .
          </FieldHint>
        </div>
        <div>
          <FieldLabel htmlFor={`${idBase}-rate-date`}>Rate card date</FieldLabel>
          <input
            id={`${idBase}-rate-date`}
            type="date"
            max={todayKey()}
            value={form.fields.rateDate}
            onChange={(event) => form.update({ rateDate: event.target.value })}
            className={inputClass}
          />
          <FieldHint>
            {formatDate(preview.specifiedDate)} under {preview.rule}. If SBI published nothing that
            day, use the last card before it.
          </FieldHint>
        </div>
      </div>

      <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <span>Tax value with these figures:</span>
        {preview.taxValue == null ? (
          <span>--</span>
        ) : (
          <Money value={preview.taxValue} formatter={formatInr} bold />
        )}
        <span>({FX_SOURCE_LABEL[preview.source]})</span>
      </p>

      {(form.problem || form.message) && (
        <output
          aria-live="polite"
          className={`block text-xs ${form.problem || form.message?.kind === 'error' ? 'text-app-red' : 'text-muted-foreground'}`}
        >
          {form.problem ?? form.message?.text}
        </output>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={form.submit} disabled={!form.canSave} isLoading={form.saving}>
          Save rate
        </Button>
        {fx && (
          <Button type="button" variant="ghost" size="sm" onClick={form.revertToEcb} isLoading={form.removing}>
            Use the ECB approximation
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
