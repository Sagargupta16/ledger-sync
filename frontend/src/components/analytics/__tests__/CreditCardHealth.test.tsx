/** Synthetic signed balances exercise outstanding debt and measured coverage. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountBalances } from '@/services/api/calculations'
import { usePreferencesStore } from '@/store/preferencesStore'

import CreditCardHealth from '../CreditCardHealth'

vi.mock('@/services/api/accountClassifications', () => ({
  accountClassificationsService: {
    getAllClassifications: () => Promise.resolve({}),
  },
}))

const NET_BALANCES: Record<string, number> = {
  'CC: Daily': -2000,
  'CC: Travel': -3000,
  'CC: Reserve': 0,
  'CC: Unconfigured A': -750,
  'CC: Unconfigured B': -250,
  'Bank Account': 4000,
}

/** Fixture classifications distinguish cards from an unrelated bank account. */
function classify(balances: Record<string, number>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(balances).map((name) => [
      name,
      name.startsWith('CC: ') ? 'Credit Cards' : 'Bank Accounts',
    ]),
  )
}

const CONFIGURED_LIMITS: Record<string, number> = {
  'CC: Daily': 10_000,
  'CC: Travel': 20_000,
  'CC: Reserve': 20_000,
}

function balancePayload(balances: Record<string, number>): AccountBalances {
  const accounts = Object.fromEntries(
    Object.entries(balances).map(([name, balance]) => [
      name,
      { balance, transactions: 1, last_transaction: '2026-07-20' },
    ]),
  )
  const total = Object.values(balances).reduce((sum, b) => sum + b, 0)
  // `statistics` is nested, matching `_compute_account_statistics` on the backend.
  // This fixture used to spread the five numbers FLAT, which encoded the same
  // drift the response type carried.
  return {
    accounts,
    statistics: {
      total_accounts: Object.keys(accounts).length,
      total_balance: total,
      average_balance: total / Object.keys(accounts).length,
      positive_accounts: Object.values(balances).filter((b) => b > 0).length,
      negative_accounts: Object.values(balances).filter((b) => b < 0).length,
    },
  }
}

async function renderCard(
  balances: Record<string, number>,
  limits: Record<string, number>,
): Promise<void> {
  usePreferencesStore.setState({ creditCardLimits: limits })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['calculations', 'account-balances', undefined], balancePayload(balances))
  qc.setQueryData(['account-classifications'], classify(balances))
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreditCardHealth />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByText('Credit Card Health')
}

/** Digits only, so the assertion does not depend on the currency symbol. */
function digitsOf(text: string): string {
  return text.replace(/[^\d.]/g, '')
}

beforeEach(() => {
  usePreferencesStore.setState({ creditCardLimits: {} })
})

describe('CreditCardHealth denominator', () => {
  it('sums only configured limits and discloses the coverage', async () => {
    await renderCard(NET_BALANCES, CONFIGURED_LIMITS)

    expect(screen.getByText(/3 of 5 cards with limits set/)).toBeInTheDocument()
    const limitRow = screen.getByText('Limits you have set').parentElement
    expect(digitsOf(limitRow?.textContent ?? '')).toContain('50000')
  })

  it('reports utilization over the measured subset, not the whole ledger', async () => {
    await renderCard(NET_BALANCES, CONFIGURED_LIMITS)

    // Measured debt is 5000 of 50000; unconfigured debt stays in the total only.
    expect(screen.getByText('10.0%')).toBeInTheDocument()
    const totalRow = screen.getByText(/^Total outstanding, all/).parentElement
    expect(digitsOf(totalRow?.lastElementChild?.textContent ?? '')).toBe('6000')
  })

  it('never invents a limit for an unconfigured card', async () => {
    await renderCard(NET_BALANCES, CONFIGURED_LIMITS)

    expect(screen.getAllByText('No limit set')).toHaveLength(2)
    expect(screen.getAllByText(/Utilization and available credit stay hidden/)).toHaveLength(2)
  })

  it('shows zero outstanding and utilization for a prepaid card', async () => {
    await renderCard({ 'CC: Prepaid': 2500 }, { 'CC: Prepaid': 10_000 })

    expect(screen.getByText(/0.0% utilization across 1 of 1 cards with limits set/)).toBeInTheDocument()
    const totalRow = screen.getByText(/^Total outstanding, all/).parentElement
    expect(digitsOf(totalRow?.lastElementChild?.textContent ?? '')).toBe('0')
    const outstandingRow = screen.getByText('Outstanding').parentElement
    expect(digitsOf(outstandingRow?.lastElementChild?.textContent ?? '')).toBe('0')
    expect(screen.queryByText('25.0%')).not.toBeInTheDocument()
  })

  it('does not offset one card debt with another card prepaid balance', async () => {
    await renderCard(
      { 'CC: Owing': -6000, 'CC: Prepaid': 2000 },
      { 'CC: Owing': 10_000, 'CC: Prepaid': 10_000 },
    )

    expect(screen.getByText(/30.0% utilization across 2 of 2 cards with limits set/)).toBeInTheDocument()
    const totalRow = screen.getByText(/^Total outstanding, all/).parentElement
    expect(digitsOf(totalRow?.lastElementChild?.textContent ?? '')).toBe('6000')
  })

  it('keeps a deliberate limit of 0 as 0 instead of falling through to 100000', async () => {
    await renderCard({ 'CC: Blocked': -5000 }, { 'CC: Blocked': 0 })

    expect(screen.getByText('Limit is 0')).toBeInTheDocument()
    expect(screen.getByText(/Limit is set to 0, so there is no headroom/)).toBeInTheDocument()
    // Under `||` this rendered "5.0%" against an invented 1,00,000.
    expect(screen.queryByText('5.0%')).not.toBeInTheDocument()
  })

  it('does not claim "no limits set" when the limit was set to 0', async () => {
    await renderCard({ 'CC: Blocked': -5000 }, { 'CC: Blocked': 0 })

    // Header and empty state both name the real reason. Previously the header
    // said "no limits set" while the card row said "Limit is set to 0".
    expect(screen.getAllByText(/one limit is set to 0/)).toHaveLength(2)
    expect(screen.queryByText(/no limits? set/)).not.toBeInTheDocument()
    // The CTA asks for the action that is actually left to take.
    expect(screen.getByText(/Raise a limit above 0/)).toBeInTheDocument()
  })

  it('singularises the empty-state copy for a single card', async () => {
    await renderCard({ 'CC: Solo': -2000 }, {})

    expect(screen.getByText(/utilization across 1 card would be invented/)).toBeInTheDocument()
    expect(screen.queryByText(/1 cards/)).not.toBeInTheDocument()
  })

  it('refuses a non-finite balance instead of printing NaN%', async () => {
    await renderCard({ 'CC: Corrupt': Number.NaN }, { 'CC: Corrupt': 30_000 })

    expect(screen.getByText('Balance unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    const totalRow = screen.getByText(/^Total outstanding/).parentElement
    expect(totalRow?.textContent ?? '').not.toContain('NaN')
  })
})
