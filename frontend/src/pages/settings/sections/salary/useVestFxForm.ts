import { useState } from 'react'

import { useDeleteVestFx, useSaveVestFx } from '@/hooks/api/useRsuTax'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { previousMonthEnd, vestTaxValue } from '@/lib/rsuTaxFx'
import { rsuTaxService, type VestClose, type VestFx } from '@/services/api/rsuTax'
import type { RsuVesting } from '@/types/salary'

export interface VestFxFields {
  employer: string
  quotePrice: string
  rate: string
  rateDate: string
}

export interface VestFxMessage {
  kind: 'error' | 'info'
  text: string
}

function initialFields(vesting: RsuVesting, fx: VestFx | undefined): VestFxFields {
  return {
    employer: fx?.employer_perquisite_inr?.toString() ?? '',
    quotePrice: fx?.quote_price?.toString() ?? '',
    rate: fx?.fx_rate?.toString() ?? '',
    rateDate: fx?.fx_date ?? previousMonthEnd(vesting.date),
  }
}

/** Blank is "not entered"; anything else must be a positive number. */
function positive(raw: string): number | null | undefined {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function closeMessage(close: VestClose): string {
  const split = close.split_factor === 1
    ? ''
    : ` Yahoo now shows ${close.adjusted_price} after later splits; this is the price before them.`
  return `Close of ${close.as_of} in ${close.currency}.${split} Check it against the fair market value on the vest confirmation.`
}

/**
 * Draft state for one vest's conversion inputs, with a live preview of the tax value.
 * `pricesInInr` is false when the display currency is not INR, so the ECB fallback is unknown.
 */
export function useVestFxForm(
  vesting: RsuVesting,
  fx: VestFx | undefined,
  onDone: () => void,
  pricesInInr = true,
) {
  const [fields, setFields] = useState(() => initialFields(vesting, fx))
  const [currency, setCurrency] = useState(fx?.quote_currency ?? 'USD')
  const [message, setMessage] = useState<VestFxMessage | null>(null)
  const [fetching, setFetching] = useState(false)
  const save = useSaveVestFx()
  const remove = useDeleteVestFx()

  const employer = positive(fields.employer)
  const quotePrice = positive(fields.quotePrice)
  const rate = positive(fields.rate)
  const invalid = employer === undefined || quotePrice === undefined || rate === undefined
  const needsPrice = rate != null && quotePrice == null
  const empty = employer == null && quotePrice == null && rate == null
  let problem: string | null = null
  if (invalid) problem = 'Amounts must be positive numbers.'
  else if (needsPrice) problem = 'Enter the vest-date price per share to use the TT buying rate.'
  else if (rate != null && !fields.rateDate) problem = 'Enter the date of the rate card.'

  const draft: VestFx | undefined = invalid
    ? undefined
    : {
        vesting_id: vesting.id ?? '',
        fx_source: 'ecb',
        fx_rate: rate ?? null,
        fx_date: rate == null ? null : fields.rateDate,
        quote_price: quotePrice ?? null,
        quote_currency: currency,
        employer_perquisite_inr: employer ?? null,
        updated_at: '',
      }
  const preview = vestTaxValue(vesting, draft, pricesInInr)

  const update = (patch: Partial<VestFxFields>) => {
    setMessage(null)
    setFields((previous) => ({ ...previous, ...patch }))
  }

  async function fetchClose() {
    if (!vesting.id) return
    setFetching(true)
    setMessage(null)
    try {
      // The backend reads the real close: Yahoo's is split-adjusted and London's is in pence.
      const close = await rsuTaxService.getVestClose(vesting.id)
      if (!/^[A-Z]{3}$/.test(close.currency) || close.as_of > vesting.date) {
        throw new Error('No dated close in a known currency on or before the vest date.')
      }
      setCurrency(close.currency)
      setFields((previous) => ({ ...previous, quotePrice: String(Math.round(close.price * 100) / 100) }))
      setMessage({ kind: 'info', text: closeMessage(close) })
    } catch {
      setMessage({
        kind: 'error',
        text: 'The vest-date close could not be loaded. Enter the price from the vest confirmation.',
      })
    } finally {
      setFetching(false)
    }
  }

  function submit() {
    if (problem || empty || !vesting.id) return
    save.mutate(
      {
        vestingId: vesting.id,
        input: {
          employer_perquisite_inr: employer ?? null,
          quote_price: quotePrice ?? null,
          quote_currency: currency,
          fx_rate: rate ?? null,
          fx_date: rate == null ? null : fields.rateDate,
        },
      },
      {
        onSuccess: onDone,
        onError: (error) => setMessage({ kind: 'error', text: getApiErrorMessage(error, 'Could not save. Try again.') }),
      },
    )
  }

  function revertToEcb() {
    if (!vesting.id) return
    remove.mutate(vesting.id, {
      onSuccess: onDone,
      onError: (error) => setMessage({ kind: 'error', text: getApiErrorMessage(error, 'Could not remove. Try again.') }),
    })
  }

  return {
    fields,
    currency,
    message,
    problem,
    preview,
    fetching,
    saving: save.isPending,
    removing: remove.isPending,
    canSave: !problem && !empty && !save.isPending,
    update,
    fetchClose,
    submit,
    revertToEcb,
  }
}
