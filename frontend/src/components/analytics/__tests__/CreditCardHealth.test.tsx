/**
 * Guards the denominator of the Credit Card Health card.
 *
 * It used to read `creditCardLimits[name] || 100000`, so every card the user had
 * not configured contributed a fabricated 1,00,000 to the total limit and to the
 * utilization percentage. The live account has 7 detected cards with 5 configured
 * limits totalling 10,40,000; the old code reported 12,40,000. The shape below is
 * that real account (values re-derived read-only from backend/ledger_sync.db via
 * the same net-balance math /api/calculations/account-balances performs).
 *
 * The `||` was independently wrong too: a deliberate limit of 0 (blocked or
 * closed card) fell through to the fake 1,00,000.
 */

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

/** Real account shape: net balances, so cards sit negative. */
const NET_BALANCES: Record<string, number> = {
  'CC: ICICI Amazon Pay': -10_000,
  'CC: HDFC Swiggy': -3846.17,
  'CC: HDFC Tata Neu Infinity': -583.32,
  'CC: CSB Jupiter': -310,
  'CC: Axis Google Flex': -169,
  'CC: HDFC Pixel Play': 0,
  'CC: ICICI Others': 0,
  'HDFC Bank': 41_000,
}

/** `CC: ` prefix marks a card, matching the live account's naming. */
function classify(balances: Record<string, number>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(balances).map((name) => [
      name,
      name.startsWith('CC: ') ? 'Credit Cards' : 'Bank Accounts',
    ]),
  )
}

/** The 5 limits actually configured on the live account. Two cards have none. */
const REAL_LIMITS: Record<string, number> = {
  'CC: ICICI Others': 300_000,
  'CC: ICICI Amazon Pay': 50_000,
  'CC: HDFC Tata Neu Infinity': 330_000,
  'CC: HDFC Swiggy': 330_000,
  'CC: HDFC Pixel Play': 30_000,
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
    await renderCard(NET_BALANCES, REAL_LIMITS)

    // 5 of 7 configured. Old code: 5 real + 2 fabricated 1,00,000 = 12,40,000.
    expect(screen.getByText(/5 of 7 cards with limits set/)).toBeInTheDocument()
    const limitRow = screen.getByText('Limits you have set').parentElement
    expect(digitsOf(limitRow?.textContent ?? '')).toContain('1040000')
    expect(digitsOf(limitRow?.textContent ?? '')).not.toContain('1240000')
  })

  it('reports utilization over the measured subset, not the whole ledger', async () => {
    await renderCard(NET_BALANCES, REAL_LIMITS)

    // 14,429.49 measured / 10,40,000 = 1.4%. Total outstanding stays 14,908.49
    // because the two unconfigured cards keep their absolute balances.
    expect(screen.getByText('1.4%')).toBeInTheDocument()
    const totalRow = screen.getByText(/^Total outstanding, all/).parentElement
    expect(digitsOf(totalRow?.textContent ?? '')).toContain('14908.49')
  })

  it('never invents a limit for an unconfigured card', async () => {
    await renderCard(NET_BALANCES, REAL_LIMITS)

    // Both unconfigured cards say so instead of showing 0.3% / 0.2% against a
    // fake 1,00,000 as the old code did.
    expect(screen.getAllByText('No limit set')).toHaveLength(2)
    expect(screen.getAllByText(/Utilization and available credit stay hidden/)).toHaveLength(2)
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
