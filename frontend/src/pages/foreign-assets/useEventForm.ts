import { useState } from 'react'

import { useCreateForeignAssetEvent } from '@/hooks/api/useRsuTax'
import { getTodayKey } from '@/lib/dateUtils'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { previousMonthEnd } from '@/lib/rsuTaxFx'
import type { ForeignAssetEventKind, LotLedger } from '@/services/api/rsuTax'

export interface EventFields {
  kind: ForeignAssetEventKind
  lotId: string
  symbol: string
  date: string
  quantity: string
  gross: string
  withheld: string
  rate: string
  /** Blank follows the specified date of the event date. */
  rateDate: string
  notes: string
}

function blankFields(ledger: LotLedger): EventFields {
  const open = ledger.lots.find((lot) => lot.remaining_quantity > 0) ?? ledger.lots[0]
  return {
    kind: 'sale',
    lotId: open?.lot_id ?? '',
    symbol: ledger.symbols[0] ?? '',
    date: getTodayKey(),
    quantity: '',
    gross: '',
    withheld: '',
    rate: '',
    rateDate: '',
    notes: '',
  }
}

/** Blank is "not entered" (null); anything else must be a number above the floor. */
function amount(raw: string, allowZero = false): number | null | undefined {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : undefined
}

function findProblem(fields: EventFields, values: Array<number | null | undefined>, rateDate: string): string | null {
  const [quantity, gross, withheld] = values
  const isSale = fields.kind === 'sale'
  if (!fields.date) return 'Enter the date.'
  if (fields.date > getTodayKey()) return 'The date cannot be in the future.'
  if (isSale && !fields.lotId) return 'Pick the vest the shares came from.'
  if (!isSale && !fields.symbol) return 'Pick the stock that paid the dividend.'
  if (values.includes(undefined)) return 'Amounts must be positive numbers.'
  if (isSale && quantity == null) return 'Enter the number of shares sold.'
  if (gross == null) return isSale ? 'Enter the sale proceeds.' : 'Enter the gross dividend.'
  if (!isSale && withheld != null && withheld > gross) return 'Tax withheld cannot exceed the gross dividend.'
  if (rateDate > getTodayKey()) return 'The rate card date cannot be in the future.'
  return null
}

/** The stock's trading currency for the chosen vest or stock, once the ledger knows it. */
function currencyFor(ledger: LotLedger, fields: EventFields): string | null {
  const lot = fields.kind === 'sale'
    ? ledger.lots.find((item) => item.lot_id === fields.lotId)
    : ledger.lots.find((item) => item.symbol === fields.symbol)
  return lot?.currency ?? null
}

/** Draft state for one sale or dividend; saving writes at once. */
export function useEventForm(ledger: LotLedger, onDone: () => void) {
  const [fields, setFields] = useState(() => blankFields(ledger))
  const [error, setError] = useState<string | null>(null)
  const create = useCreateForeignAssetEvent()
  const isSale = fields.kind === 'sale'
  const quantity = amount(fields.quantity)
  const gross = amount(fields.gross)
  const withheld = amount(fields.withheld, true)
  const rate = amount(fields.rate)
  const specifiedDate = fields.date ? previousMonthEnd(fields.date) : ''
  const rateDate = fields.rateDate || specifiedDate

  function update(patch: Partial<EventFields>) {
    setError(null)
    setFields((previous) => ({ ...previous, ...patch }))
  }

  function submit() {
    const problem = findProblem(fields, [quantity, gross, withheld, rate], rate == null ? '' : rateDate)
    if (problem || gross == null) {
      setError(problem ?? 'Enter the amount.')
      return
    }
    create.mutate(
      {
        kind: fields.kind,
        lot_id: isSale ? fields.lotId : null,
        symbol: isSale ? null : fields.symbol,
        event_date: fields.date,
        quantity: isSale ? quantity : null,
        gross_amount: gross,
        tax_withheld: isSale ? null : (withheld ?? null),
        fx_rate: rate ?? null,
        fx_date: rate == null ? null : rateDate || null,
        notes: fields.notes.trim() || null,
      },
      {
        onSuccess: () => {
          setFields(blankFields(ledger))
          onDone()
        },
        onError: (failure) => setError(getApiErrorMessage(failure, 'Could not save. Try again.')),
      },
    )
  }

  return {
    fields,
    update,
    submit,
    error,
    saving: create.isPending,
    isSale,
    specifiedDate,
    rateDate,
    currency: currencyFor(ledger, fields),
  }
}
