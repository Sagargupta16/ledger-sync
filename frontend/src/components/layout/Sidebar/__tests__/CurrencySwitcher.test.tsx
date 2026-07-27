/**
 * The switcher must not offer a currency the app cannot price.
 *
 * Found 2026-07-27. It rendered straight from the `CURRENCIES` metadata
 * catalogue, which includes AED -- but the live ECB feed the backend proxies
 * carries 29 currencies and AED is not one of them. Picking it produced a null
 * rate, the formatters returned the amount unconverted, and the dirham symbol was
 * applied regardless: raw rupees labelled as dirhams, a ~23x overstatement with
 * no error and no indicator.
 *
 * Options are now derived from the rates actually served, so the defect cannot
 * recur for AED or for any currency added to the catalogue later.
 */

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExchangeRatesResponse } from '@/services/api/preferences'

const getExchangeRates = vi.fn<() => Promise<ExchangeRatesResponse>>()
const updateMutate = vi.fn()

vi.mock('@/services/api/preferences', () => ({
  preferencesService: { getExchangeRates: () => getExchangeRates() },
}))

vi.mock('@/hooks/api/usePreferences', () => ({
  useUpdatePreferences: () => ({ mutate: updateMutate }),
}))

const CurrencySwitcher = (await import('../CurrencySwitcher')).default
const { usePreferencesStore } = await import('@/store/preferencesStore')
const { useAuthStore } = await import('@/store/authStore')

/** The codes `/api/exchange-rates?base=INR` actually returned on 2026-07-27. */
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

const renderSwitcher = () => render(<CurrencySwitcher />, { wrapper })

/** Open the dropdown and return the option codes it lists. */
async function openOptions(): Promise<string[]> {
  fireEvent.click(screen.getByRole('button', { name: /change display currency/i }))
  const list = await screen.findByRole('list', { name: 'Display currency' })
  return Array.from(list.querySelectorAll('li')).map(
    (li) => li.querySelector('span:last-of-type')?.textContent ?? '',
  )
}

beforeEach(() => {
  getExchangeRates.mockReset()
  updateMutate.mockReset()
  getExchangeRates.mockResolvedValue({ base: 'INR', rates: LIVE_RATES, fetched_at: 1_769_000_000 })
  useAuthStore.setState({ accessToken: 'test-token' })
  usePreferencesStore.setState({
    displayCurrency: 'INR',
    exchangeRate: null,
    exchangeRateUpdatedAt: null,
  })
})

describe('CurrencySwitcher option set', () => {
  it('does not offer AED, which the live feed cannot price', async () => {
    renderSwitcher()
    await waitFor(() => expect(getExchangeRates).toHaveBeenCalled())

    const codes = await openOptions()

    expect(codes).not.toContain('AED')
    // Sanity: the list did render, so the assertion above is not vacuous.
    expect(codes).toContain('USD')
  })

  it('offers only priceable currencies plus the base currency', async () => {
    renderSwitcher()
    await waitFor(() => expect(getExchangeRates).toHaveBeenCalled())

    const codes = await openOptions()

    expect(codes.length).toBeGreaterThan(1)
    for (const code of codes) {
      if (code !== 'INR') expect(LIVE_RATES[code]).toBeGreaterThan(0)
    }
  })

  it('still offers the base currency when the rates request fails', async () => {
    getExchangeRates.mockRejectedValue(new Error('upstream down'))
    renderSwitcher()

    const codes = await openOptions()

    // Never an empty menu: INR needs no rate, it is what the ledger is stored in.
    expect(codes).toEqual(['INR'])
  })

  it('offers only the base currency when the payload carries no rates object', async () => {
    // Demo mode reaches exactly this state: the demo request interceptor answers
    // every GET from a route table that has no `/api/exchange-rates` entry, so it
    // resolves the catch-all `[]`. No rates means nothing is convertible, and
    // offering a currency anyway is what produced mislabelled demo figures.
    getExchangeRates.mockResolvedValue([] as unknown as ExchangeRatesResponse)
    renderSwitcher()
    await waitFor(() => expect(getExchangeRates).toHaveBeenCalled())

    expect(await openOptions()).toEqual(['INR'])
  })

  it('offers AED once the served payload does price it', async () => {
    // Not a blocklist -- the backend's hardcoded fallback table does carry AED,
    // and on that payload the currency is genuinely convertible.
    getExchangeRates.mockResolvedValue({
      base: 'INR',
      rates: { ...LIVE_RATES, AED: 0.03838 },
      fetched_at: null,
      fallback: true,
      fallback_as_of: '2026-05-13',
    })
    renderSwitcher()
    await waitFor(() => expect(getExchangeRates).toHaveBeenCalled())

    expect(await openOptions()).toContain('AED')
  })
})

describe('CurrencySwitcher unpriced-selection state', () => {
  it('labels amounts as the base currency and says why, for a stored AED', async () => {
    // A user who selected AED before this was enforced still has it persisted.
    usePreferencesStore.setState({ displayCurrency: 'AED', exchangeRate: null })
    renderSwitcher()
    await waitFor(() => expect(getExchangeRates).toHaveBeenCalled())

    // The control names the currency the figures are really in, not the dead
    // selection. Silence here is what let dirhams label rupees.
    expect(
      await screen.findByRole('button', { name: /no rate for AED, showing INR/i }),
    ).toBeInTheDocument()
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('No AED rate')
    expect(status).toHaveTextContent('INR')
  })

  it('shows the rate pill and no warning when conversion really is in effect', async () => {
    usePreferencesStore.setState({ displayCurrency: 'USD', exchangeRate: 0.01036 })
    renderSwitcher()
    await waitFor(() => expect(getExchangeRates).toHaveBeenCalled())

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // 1 / 0.01036 = 96.53
    expect(screen.getByText(/1 USD = INR 96\.53/)).toBeInTheDocument()
  })

  it('stays quiet on the base currency, which needs no rate', async () => {
    renderSwitcher()
    await waitFor(() => expect(getExchangeRates).toHaveBeenCalled())

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /currently INR/i })).toBeInTheDocument()
  })
})
