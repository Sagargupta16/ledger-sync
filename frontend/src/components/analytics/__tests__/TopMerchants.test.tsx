/**
 * Guards the data source of the Top Merchants card.
 *
 * It used to call `useTransactions()` with no arguments, pulling the entire
 * ledger (~3.8 MB on a real account) into the browser to re-split notes in JS.
 * These tests seed ONLY the merchant-rollup query key: if the component ever
 * reaches for the transactions endpoint again, nothing resolves and the
 * assertions fall back to the skeleton.
 */

import { QueryClient, QueryClientProvider, hashKey } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import type { MerchantRow } from '@/pages/merchant-intelligence/types'

import TopMerchants from '../TopMerchants'

const ROWS: MerchantRow[] = [
  {
    merchant: 'Uber',
    label_kind: 'brand',
    aliases: ['Uber ride'],
    category: 'Transportation',
    subcategory: 'Cab',
    total_spent: 61_000,
    transaction_count: 837,
    avg_transaction: 72.88,
    first_transaction: '2023-05-04',
    last_transaction: '2026-07-20',
    months_active: 39,
    avg_days_between: 1.4,
    is_recurring: true,
  },
  {
    merchant: 'Fruits',
    label_kind: 'descriptor',
    aliases: ['Fruits'],
    category: 'Food & Dining',
    subcategory: 'Groceries',
    total_spent: 63_825,
    transaction_count: 195,
    avg_transaction: 327.31,
    first_transaction: '2023-05-01',
    last_transaction: '2026-07-19',
    months_active: 39,
    avg_days_between: 5.6,
    is_recurring: true,
  },
  {
    merchant: 'Unknown',
    label_kind: 'descriptor',
    aliases: [],
    category: 'Food & Dining',
    subcategory: null,
    total_spent: 116_644,
    transaction_count: 360,
    avg_transaction: 324,
    first_transaction: '2023-05-01',
    last_transaction: '2026-07-01',
    months_active: 39,
    avg_days_between: 3.2,
    is_recurring: true,
  },
]

/** Rollup params TopMerchants requests; mirrored so the seed key matches. */
const PARAMS = { min_transactions: 2, limit: 200 }

beforeAll(() => {
  if (globalThis.IntersectionObserver === undefined) {
    class NoopIntersectionObserver implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = ''
      readonly scrollMargin = ''
      readonly thresholds: readonly number[] = []
      disconnect() {}
      observe() {}
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return []
      }
    }
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      value: NoopIntersectionObserver,
      writable: true,
    })
  }
})

function renderCard(props?: Parameters<typeof TopMerchants>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(analyticsV2Keys.merchantIntelligence(PARAMS), ROWS)
  render(
    <QueryClientProvider client={qc}>
      <TopMerchants {...props} />
    </QueryClientProvider>,
  )
  return qc
}

describe('TopMerchants', () => {
  it('renders from the merchant rollup without touching the transactions cache', () => {
    const qc = renderCard()

    expect(screen.getByText('Uber')).toBeInTheDocument()
    // The only query this card observes is the rollup. A `['transactions', ...]`
    // key must never appear -- that is the 3.8 MB fetch this rewrite removed.
    const observed = qc
      .getQueryCache()
      .getAll()
      .filter((q) => q.getObserversCount() > 0)
      .map((q) => hashKey(q.queryKey))
    expect(observed).toEqual([hashKey(analyticsV2Keys.merchantIntelligence(PARAMS))])
    expect(observed.some((key) => key.includes('"transactions"'))).toBe(false)
  })

  it('drops placeholder notes and badges descriptor rows as notes', () => {
    renderCard()

    // "Unknown" is the largest label by count in the real rollup; presenting it
    // as a merchant would make the card useless.
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
    expect(screen.getByText('Fruits')).toBeInTheDocument()
    // Fruits is a note, Uber is a brand: exactly one "(note)" marker.
    expect(screen.getAllByText('(note)')).toHaveLength(1)
    // Footer totals cover the 2 kept rows only: 837 + 195 payments, not the
    // 1,392 you would get by counting the dropped placeholder row too.
    expect(screen.getByText('1032')).toBeInTheDocument()
  })

  it('states its all-time scope instead of accepting a date window it cannot apply', () => {
    // The rollup is whole-ledger. The card used to take a `dateRange` prop that
    // only swapped a subtitle string while the numbers stayed all-time; the prop
    // is gone and the scope is stated unconditionally.
    renderCard()
    expect(
      screen.getByText('All-time totals per payee, not filtered by the date range above'),
    ).toBeInTheDocument()
  })

  it('filters to a single category and says the totals are the payee\'s full spend', () => {
    // The rollup keeps ONE primary category per payee, so this cannot re-cut a
    // multi-category payee's spend. Naming that beats implying a clean split.
    renderCard({ categoryFilter: 'Transportation' })
    expect(screen.getByText('Uber')).toBeInTheDocument()
    expect(screen.queryByText('Fruits')).not.toBeInTheDocument()
    expect(
      screen.getByText('All-time payees whose main category is Transportation, at their full spend'),
    ).toBeInTheDocument()
  })
})
