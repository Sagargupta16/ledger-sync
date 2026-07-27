/**
 * Settings must not offer a display currency the app cannot price.
 *
 * This is the SECOND currency-selection surface. The sidebar `CurrencySwitcher`
 * was fixed to derive its options from the served rates, but this section still
 * rendered `Object.values(CURRENCIES)` -- the metadata catalogue -- so AED was
 * still one click away from the Settings page even though the live ECB feed the
 * backend proxies does not carry it (29 codes, verified 2026-07-27). Fixing one
 * surface and leaving the other is exactly the drift the central helper exists
 * to prevent, so both now read `selectableCurrencies`.
 *
 * The second case here is the one the switcher does not have: this `<select>` is
 * CONTROLLED. Filtering an already-persisted-but-unpriced currency out of the
 * option list would leave `value` matching no option, and a browser then paints
 * the first option instead -- so the page would claim a currency the account is
 * not set to, and any unrelated Save would rewrite the preference to it.
 */

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExchangeRatesResponse } from '@/services/api/preferences'

const getExchangeRates = vi.fn<() => Promise<ExchangeRatesResponse>>()

vi.mock('@/services/api/preferences', () => ({
  preferencesService: { getExchangeRates: () => getExchangeRates() },
}))

const DisplayPreferencesSection = (await import('../DisplayPreferencesSection')).default
const { useAuthStore } = await import('@/store/authStore')
const { buildInitialLocalPrefs } = await import('../../helpers')
type LocalPrefs = import('../../types').LocalPrefs

/**
 * The codes `/api/exchange-rates?base=INR` really returned on 2026-07-27. AED is
 * absent, which is the whole point -- it is in `CURRENCIES` but not here.
 */
const LIVE_RATES: Record<string, number> = {
  AUD: 0.01482, BRL: 0.05264, CAD: 0.01459, CHF: 0.00847, CNY: 0.07013,
  CZK: 0.21982, DKK: 0.06805, EUR: 0.0091, GBP: 0.00777, HKD: 0.08122,
  HUF: 3.294, IDR: 185.67, ILS: 0.03163, ISK: 1.3017, JPY: 1.6965,
  KRW: 15.13, MXN: 0.18102, MYR: 0.04237, NOK: 0.09911, NZD: 0.01789,
  PHP: 0.64036, PLN: 0.03928, RON: 0.04765, SEK: 0.10063, SGD: 0.01337,
  THB: 0.34889, TRY: 0.49031, USD: 0.01036, ZAR: 0.1745,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Minimal but real `LocalPrefs`, built by the same helper the page uses. */
function prefs(displayCurrency: string): LocalPrefs {
  return {
    ...(buildInitialLocalPrefs({ display_currency: displayCurrency }) as Record<string, unknown>),
  } as unknown as LocalPrefs
}

const updateLocalPref = vi.fn()

function renderSection(displayCurrency = 'INR') {
  return render(
    <DisplayPreferencesSection
      index={0}
      localPrefs={prefs(displayCurrency)}
      updateLocalPref={updateLocalPref}
    />,
    { wrapper },
  )
}

/** The section renders collapsed; open it so the form is in the tree. */
async function openSection(): Promise<HTMLSelectElement> {
  fireEvent.click(screen.getByRole('button', { name: /Display & Preferences/i }))
  return (await screen.findByLabelText('Display Currency')) as HTMLSelectElement
}

const optionCodes = (select: HTMLSelectElement) =>
  Array.from(select.options).map((o) => o.value)

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ accessToken: 'test-token' })
  getExchangeRates.mockResolvedValue({
    base: 'INR',
    rates: LIVE_RATES,
    // Unix seconds, which is what the endpoint serves -- an ISO string here
    // throws `RangeError: Invalid time value` inside `rateAsOf`.
    fetched_at: 1_753_315_200,
  })
})

describe('DisplayPreferencesSection currency options', () => {
  it('offers only currencies the served rates can price', async () => {
    renderSection()
    const select = await openSection()

    await waitFor(() => expect(optionCodes(select)).toContain('USD'))

    expect(optionCodes(select)).not.toContain('AED')
    // Priced catalogue entries are all still offered -- the fix filters by rate
    // availability, it does not blocklist one code.
    for (const code of ['USD', 'EUR', 'GBP', 'JPY', 'SGD', 'HKD']) {
      expect(optionCodes(select)).toContain(code)
    }
  })

  it('always offers the base currency, even with no rates at all', async () => {
    getExchangeRates.mockRejectedValue(new Error('rates unavailable'))
    renderSection()
    const select = await openSection()

    // INR needs no rate: it is what the ledger is stored in.
    await waitFor(() => expect(optionCodes(select)).toEqual(['INR']))
    expect(select.value).toBe('INR')
  })

  it('keeps an already-persisted unpriced currency selectable so the value is never silently swapped', async () => {
    renderSection('AED')
    const select = await openSection()

    await waitFor(() => expect(optionCodes(select)).toContain('USD'))

    // Present as an option ONLY because it is the stored selection...
    expect(optionCodes(select)).toContain('AED')
    // ...so the control still reports what the account is actually set to.
    expect(select.value).toBe('AED')
    // And the hint says the amounts are not really dirhams.
    expect(screen.getByText(/No live rate for AED/i)).toBeInTheDocument()
  })

  it('does not re-offer an unpriced currency once the user moves off it', async () => {
    renderSection('USD')
    const select = await openSection()

    await waitFor(() => expect(optionCodes(select)).toContain('USD'))
    expect(optionCodes(select)).not.toContain('AED')
  })
})
