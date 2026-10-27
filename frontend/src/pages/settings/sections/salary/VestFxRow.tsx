import Button from '@/components/ui/Button'
import Money from '@/components/ui/Money'
import { formatDate, getActiveLocale } from '@/lib/formatters'
import {
  FX_SOURCE_LABEL,
  formatInr,
  formatQuote,
  formatSignedInr,
  vestTaxValue,
  type VestTaxValue,
} from '@/lib/rsuTaxFx'
import type { VestFx } from '@/services/api/rsuTax'
import type { RsuGrant, RsuVesting } from '@/types/salary'

import VestFxEditor from './VestFxEditor'

interface VestFxRowProps {
  grant: RsuGrant
  vesting: RsuVesting
  fx: VestFx | undefined
  editing: boolean
  canEdit: boolean
  onToggle: () => void
  onDone: () => void
  /** False when the display currency is not INR, so saved vest prices are not rupees. */
  pricesInInr: boolean
}

function sourceDetail(value: VestTaxValue, fx: VestFx | undefined, pricesInInr: boolean): string {
  if (value.source === 'employer') return 'From the employer (Form 16 / 12BA or payslip)'
  if (value.source === 'sbi_ttbr' && fx?.fx_rate != null && fx.quote_price != null) {
    const on = fx.fx_date ? ` on ${formatDate(fx.fx_date)}` : ''
    return `${formatInr(fx.fx_rate)}${on}, at ${formatQuote(fx.quote_price, fx.quote_currency)} a share`
  }
  if (!pricesInInr) return 'The saved vest price is not in rupees: enter a rate or the employer figure'
  return value.ecbValue == null
    ? 'Vest-date price not locked yet: fetch it above'
    : 'The vest price the app converted on the vest date'
}

function differenceText(value: VestTaxValue): string {
  if (value.source === 'ecb') return 'Approximation'
  if (value.difference == null) return 'No ECB value to compare'
  if (Math.abs(value.difference) < 0.005) return 'Same as the ECB value'
  return `${formatSignedInr(value.difference)} vs the ECB value`
}

/** One vest: which rate governs its rupee value, and how far that is from the ECB figure. */
export default function VestFxRow(props: Readonly<VestFxRowProps>) {
  const { grant, vesting, fx, editing, canEdit, onToggle, onDone, pricesInInr } = props
  const value = vestTaxValue(vesting, fx, pricesInInr)
  const label = `${grant.stock_name || 'RSU'} vest of ${formatDate(vesting.date)}`
  const shares = Number(vesting.quantity).toLocaleString(getActiveLocale(), { maximumFractionDigits: 6 })

  return (
    <li className="rounded-md border border-border/60 bg-[var(--overlay-2)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {formatDate(vesting.date)}
            <span className="text-muted-foreground"> ({shares} gross shares)</span>
          </p>
          <p className="text-xs font-medium text-text-secondary">{FX_SOURCE_LABEL[value.source]}</p>
          <p className="text-[11px] text-muted-foreground">{sourceDetail(value, fx, pricesInInr)}</p>
          {value.rateDateMismatch && (
            <p className="text-[11px] text-app-orange">
              The rate date is not on or just before {formatDate(value.specifiedDate)}.
            </p>
          )}
        </div>
        <div className="text-right">
          {value.taxValue == null ? (
            <span className="text-sm text-muted-foreground">--</span>
          ) : (
            <Money value={value.taxValue} formatter={formatInr} bold className="text-sm" />
          )}
          <p className="text-[11px] text-muted-foreground">{differenceText(value)}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-text-tertiary">
          Specified date {formatDate(value.specifiedDate)} ({value.rule})
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggle}
          disabled={!canEdit}
          aria-expanded={editing}
          aria-label={`${editing ? 'Close' : 'Edit'} the tax exchange rate for the ${label}`}
        >
          {editing ? 'Close' : 'Edit'}
        </Button>
      </div>
      {editing && (
        <VestFxEditor grant={grant} vesting={vesting} fx={fx} onDone={onDone} pricesInInr={pricesInInr} />
      )}
    </li>
  )
}
