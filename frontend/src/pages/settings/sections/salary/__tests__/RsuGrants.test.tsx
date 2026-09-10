import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePreferencesStore } from '@/store/preferencesStore'
import type { RsuGrant } from '@/types/salary'

import { RsuGrants } from '../RsuGrants'
import { useRsuGrants } from '../useRsuGrants'

const priceMocks = vi.hoisted(() => ({ getStockPrice: vi.fn(), getExchangeRates: vi.fn() }))
vi.mock('@/services/api/preferences', () => ({ preferencesService: priceMocks }))

const grant: RsuGrant = {
  id: 'g1',
  stock_name: 'TEST',
  stock_price: 200,
  grant_date: null,
  notes: null,
  vestings: [{ date: '2025-08-15', quantity: 25, price_at_vest: 150 }],
}

function GrantEditor({
  initialGrant = grant,
  onUpdate = vi.fn(),
}: Readonly<{ initialGrant?: RsuGrant; onUpdate?: (grants: RsuGrant[]) => void }>) {
  const [grants, setGrants] = useState([initialGrant])
  const actions = useRsuGrants(grants, (updated) => {
    setGrants(updated)
    onUpdate(updated)
  }, 'INR')

  return (
    <RsuGrants
      grants={grants}
      fetchingPriceFor={actions.fetchingPriceFor}
      fetchingVestPricesFor={actions.fetchingVestPricesFor}
      priceStatusByGrant={actions.priceStatusByGrant}
      onAddGrant={actions.addGrant}
      onRemoveGrant={actions.removeGrant}
      onUpdateGrant={actions.updateGrant}
      onAddVesting={actions.addVesting}
      onUpdateVesting={actions.updateVesting}
      onRemoveVesting={actions.removeVesting}
      onSortVestings={actions.sortGrantVestings}
      onFetchStockPrice={(selectedGrant) => { void actions.fetchStockPrice(selectedGrant) }}
      onFetchVestPrices={(selectedGrant) => { void actions.fetchVestPrices(selectedGrant) }}
    />
  )
}

function receivedInput() {
  return within(screen.getByRole('table')).getByRole('spinbutton', {
    name: 'Actual shares received after tax for TEST vesting 1',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  usePreferencesStore.setState({ displayCurrency: 'INR', exchangeRate: null, fiscalYearStartMonth: 4 })
})

afterEach(cleanup)

describe('RSU received-unit settings', () => {
  it('shows after-tax estimates on desktop, mobile and totals without saving inferred actuals', () => {
    const onUpdate = vi.fn()
    render(<GrantEditor onUpdate={onUpdate} />)
    const table = within(screen.getByRole('table'))
    const card = within(screen.getByRole('article', { name: 'TEST vesting 1' }))

    expect(receivedInput()).toHaveValue(null)
    expect(receivedInput()).toHaveAttribute('placeholder', '17.2')
    expect(table.getByText('Estimated units')).toBeInTheDocument()
    expect(table.getByText('₹2,580')).toBeInTheDocument()
    expect(table.getByText('Gross ₹3,750')).toBeInTheDocument()
    expect(card.getByText('Estimated after-tax value')).toBeInTheDocument()
    expect(card.getByText('₹2,580')).toBeInTheDocument()
    expect(screen.getByText('17.2 shares')).toBeInTheDocument()
    expect(screen.getByText('Includes estimated units')).toBeInTheDocument()
    expect(screen.getByText(/30% tax plus 4% cess on that tax/)).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(grant.vestings[0]).not.toHaveProperty('net_quantity')
  })

  it('uses fractional actuals consistently while retaining the gross tax basis', () => {
    const onUpdate = vi.fn()
    render(<GrantEditor onUpdate={onUpdate} />)

    fireEvent.change(receivedInput(), { target: { value: '17.212345' } })

    const table = within(screen.getByRole('table'))
    const card = within(screen.getByRole('article', { name: 'TEST vesting 1' }))
    expect(receivedInput()).toHaveValue(17.212345)
    expect(receivedInput()).toBeValid()
    expect(table.getByText('Actual units')).toBeInTheDocument()
    expect(table.getByText('₹2,581.85')).toBeInTheDocument()
    expect(card.getByText('Received value')).toBeInTheDocument()
    expect(card.getByText('₹2,581.85')).toBeInTheDocument()
    expect(screen.getByText('17.212345 shares')).toBeInTheDocument()
    expect(onUpdate).toHaveBeenLastCalledWith([{
      ...grant,
      vestings: [{ ...grant.vestings[0], net_quantity: 17.212345 }],
    }])
  })

  it('honors zero actual units and returns to an estimate when the override is cleared', () => {
    const onUpdate = vi.fn()
    render(<GrantEditor onUpdate={onUpdate} />)

    fireEvent.change(receivedInput(), { target: { value: '0' } })

    expect(receivedInput()).toHaveValue(0)
    expect(receivedInput()).toBeValid()
    expect(within(screen.getByRole('table')).getByText('₹0')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Gross ₹3,750')).toBeInTheDocument()
    expect(onUpdate).toHaveBeenLastCalledWith([{
      ...grant,
      vestings: [{ ...grant.vestings[0], net_quantity: 0 }],
    }])

    fireEvent.change(receivedInput(), { target: { value: '' } })

    expect(receivedInput()).toHaveValue(null)
    expect(within(screen.getByRole('table')).getByText('Estimated units')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('₹2,580')).toBeInTheDocument()
    expect(onUpdate).toHaveBeenLastCalledWith([{
      ...grant,
      vestings: [{ ...grant.vestings[0], net_quantity: null }],
    }])
  })

  it('updates estimates with gross units but preserves previously entered actual units', () => {
    render(<GrantEditor />)
    const gross = within(screen.getByRole('table')).getByRole('spinbutton', {
      name: 'Gross granted quantity for TEST vesting 1',
    })

    fireEvent.change(gross, { target: { value: '50' } })
    expect(receivedInput()).toHaveAttribute('placeholder', '34.4')
    expect(within(screen.getByRole('table')).getByText('₹5,160')).toBeInTheDocument()

    fireEvent.change(receivedInput(), { target: { value: '20' } })
    fireEvent.change(gross, { target: { value: '75' } })

    expect(receivedInput()).toHaveValue(20)
    expect(within(screen.getByRole('table')).getByText('₹3,000')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Gross ₹11,250')).toBeInTheDocument()
  })

  it('keeps explicit no-withholding records at the gross quantity', () => {
    const saved: RsuGrant = {
      ...grant,
      vestings: [{ ...grant.vestings[0], net_quantity: 25 }],
    }
    const onUpdate = vi.fn()
    render(<GrantEditor initialGrant={saved} onUpdate={onUpdate} />)

    expect(receivedInput()).toHaveValue(25)
    expect(within(screen.getByRole('table')).getByText('₹3,750')).toBeInTheDocument()
    expect(screen.getByText('25 shares')).toBeInTheDocument()
    expect(screen.queryByText('Includes estimated units')).not.toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('keeps missing historical prices as estimates until a requested dated FX lookup succeeds', async () => {
    const missing: RsuGrant = {
      ...grant,
      vestings: [{ date: '2025-08-15', quantity: 25, net_quantity: 17.2 }],
    }
    const onUpdate = vi.fn()
    priceMocks.getStockPrice.mockResolvedValue({
      symbol: 'TEST', price: 200, currency: 'USD', as_of: '2025-08-15',
    })
    priceMocks.getExchangeRates.mockRejectedValue(new Error('Unavailable'))
    render(<GrantEditor initialGrant={missing} onUpdate={onUpdate} />)

    expect(priceMocks.getStockPrice).not.toHaveBeenCalled()
    expect(within(screen.getByRole('table')).getByText('Current price estimate')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Vest-date price missing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fetch vest-date prices' }))
    await screen.findByText(/could not be converted to INR/)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(priceMocks.getExchangeRates).toHaveBeenCalledWith('USD', '2025-08-15')

    priceMocks.getExchangeRates.mockResolvedValue({
      base: 'USD', rates: { INR: 80 }, historical: true, requested_date: '2025-08-15',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch vest-date prices' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce())
    expect(onUpdate).toHaveBeenLastCalledWith([{
      ...missing,
      vestings: [{ ...missing.vestings[0], price_at_vest: 16_000 }],
    }])
    expect(within(screen.getByRole('table')).getByText('Vest-date ₹16,000')).toBeInTheDocument()
  })

  it('does not replace a current INR price with an unconverted foreign price', async () => {
    const onUpdate = vi.fn()
    priceMocks.getStockPrice.mockResolvedValue({
      symbol: 'TEST', price: 250, currency: 'USD', as_of: null,
    })
    priceMocks.getExchangeRates.mockResolvedValue({ base: 'USD', rates: {} })
    render(<GrantEditor onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fetch latest price for TEST' }))

    await screen.findByText(/Could not load a valid price in INR/)
    expect(screen.getByRole('spinbutton', { name: 'Price / Share' })).toHaveValue(200)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('fetches only missing past prices and preserves an already locked vest', async () => {
    const locked = { date: '2024-08-15', quantity: 10, price_at_vest: 150, net_quantity: 7 }
    const missing = { date: '2025-08-15', quantity: 25, net_quantity: 17.2 }
    const onUpdate = vi.fn()
    priceMocks.getStockPrice.mockResolvedValue({
      symbol: 'TEST', price: 200, currency: 'USD', as_of: '2025-08-15',
    })
    priceMocks.getExchangeRates.mockResolvedValue({
      base: 'USD', rates: { INR: 80 }, historical: true, requested_date: '2025-08-15',
    })
    render(<GrantEditor initialGrant={{ ...grant, vestings: [locked, missing] }} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fetch vest-date prices' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce())
    expect(priceMocks.getStockPrice).toHaveBeenCalledExactlyOnceWith('TEST', '2025-08-15')
    expect(onUpdate).toHaveBeenLastCalledWith([{
      ...grant,
      vestings: [locked, { ...missing, price_at_vest: 16_000 }],
    }])
  })
})
