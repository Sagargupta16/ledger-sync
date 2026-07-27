import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'

import MerchantIntelligencePage from '../MerchantIntelligencePage'
import { MIN_TRANSACTIONS, ROW_LIMIT } from '../useMerchantIntel'
import type { MerchantRow } from '../types'

const ROWS: MerchantRow[] = [
  {
    merchant: 'Home',
    label_kind: 'descriptor',
    aliases: ['Home'],
    category: 'Housing',
    subcategory: 'Rent',
    total_spent: 1_241_500,
    transaction_count: 31,
    avg_transaction: 40_048.39,
    first_transaction: '2023-05-01',
    last_transaction: '2026-07-01',
    months_active: 39,
    avg_days_between: 38.5,
    is_recurring: true,
  },
  {
    merchant: 'Uber',
    label_kind: 'brand',
    aliases: ['Uber ride', 'Uber - Auto'],
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

function renderPage(rows: MerchantRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seed through the shared key factory, never a hand-written literal key --
  // staleTime is Infinity, so a key that misses by one segment would silently
  // leave the page in its loading branch and this test would prove nothing.
  qc.setQueryData(
    analyticsV2Keys.merchantIntelligence({
      min_transactions: MIN_TRANSACTIONS,
      limit: ROW_LIMIT,
    }),
    rows,
  )
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MerchantIntelligencePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Text of every KPI card's value slot -- the one MetricCard animates. */
function metricValues(): (string | null)[] {
  return [...document.querySelectorAll('output.metric-value')].map((node) => node.textContent)
}

/**
 * jsdom has no IntersectionObserver, and the page's `SCROLL_FADE_UP` sections
 * use motion's `whileInView`, which constructs one on mount. Stub it here rather
 * than in the shared setup file: it is this page's dependency, and the sections
 * render their children either way -- only the entry animation is skipped.
 */
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

describe('MerchantIntelligencePage render probe', () => {
  it('mounts with rows and filters the placeholder label out of the KPIs', () => {
    renderPage(ROWS)
    expect(screen.getByRole('heading', { name: 'Merchant Intelligence' })).toBeInTheDocument()
    // 3 rows in, 2 usable: the "Unknown" placeholder row is dropped, so the
    // tracked totals must exclude its 116,644 spend and 360 payments.
    expect(screen.getByText('868 payments, ₹13,02,500')).toBeInTheDocument()
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Which payees drive the spend' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Every payee' })).toBeInTheDocument()
  })

  it('labels the Pareto chart with the caller-supplied noun, singular verb included', () => {
    renderPage(ROWS)
    // Home is 95% of the 13,02,500 tracked spend, so the vital few is exactly
    // one payee -- the copy has to agree in number ("payee makes", not
    // "payees make"), which is what the itemNoun prop buys over hardcoding
    // "category".
    expect(
      screen.getByText('1 payee makes up 80% of your spend -- the rest are the long tail'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: /Pareto chart of payee spending: bars show spend per payee/,
      }),
    ).toBeInTheDocument()
  })

  it('marks a raw-note label as a note rather than presenting it as a brand', () => {
    renderPage(ROWS)
    // "Home" is the narration, not a payee. The KPI has to say so, and the
    // table has to badge it -- one brand badge for Uber, one note badge for Home.
    expect(screen.getByText('Home (note), 95.3% of tracked spend')).toBeInTheDocument()
    expect(screen.getAllByTitle('Recognised payee name')).toHaveLength(1)
    expect(
      screen.getAllByTitle(
        'Raw transaction note, not a confirmed payee. This is what was bought.',
      ),
    ).toHaveLength(1)
  })

  it('separates the biggest payee from the most frequent one', () => {
    renderPage(ROWS)
    // Home is 31 payments of ~40k; Uber is 837 payments of ~73. Collapsing
    // these into one "top merchant" KPI would hide the entire small-ticket
    // leak, which is the reason both cards exist.
    // The figures are the animated KPI values; the payee names sit beside them
    // in the subtitles (see the free-text test below for why).
    expect(metricValues()).toContain('₹12,41,500')
    expect(screen.getByText('Home (note), 95.3% of tracked spend')).toBeInTheDocument()
    expect(metricValues()).toContain('837 payments')
    expect(screen.getByText('Uber, avg ₹72.88')).toBeInTheDocument()
  })

  it('keeps free-text payee names out of the MetricCard value slot', () => {
    // MetricCard runs its `value` through useAnimatedValue, which parses any
    // embedded digits and animates them -- so a payee label like
    // "Rent - Flat (1B Hyd)" would render as "Rent - Flat (0B Hyd)" mid-frame,
    // a payee that never existed. Names belong in the subtitle.
    renderPage([
      {
        ...ROWS[0],
        merchant: 'Rent - Flat (1B Hyd)',
        label_kind: 'descriptor',
      },
    ])
    expect(metricValues()).not.toContain('Rent - Flat (1B Hyd) (note)')
    expect(metricValues()).toContain('₹12,41,500')
    expect(metricValues()).toContain('31 payments')
    // The name still has to be visible -- just in a slot that is not animated.
    expect(
      screen.getByText('Rent - Flat (1B Hyd) (note), 100.0% of tracked spend'),
    ).toBeInTheDocument()
  })

  it('drops the payee table to label/value cards at phone width', () => {
    // 7 columns would horizontal-scroll on a phone. `mobileCards` is only
    // honoured when useIsMobile() is true, and that reads window.innerWidth on
    // first render -- so the prop being present is not proof the cards render.
    const original = globalThis.window.innerWidth
    Object.defineProperty(globalThis.window, 'innerWidth', { value: 375, configurable: true })
    try {
      renderPage(ROWS)
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      const cards = screen.getByRole('list', {
        name: 'Payees by total spend, payment count, average payment and cadence',
      })
      expect(cards.querySelectorAll('li')).toHaveLength(2)
      expect(screen.getAllByText('Share of tracked spend')).toHaveLength(2)
    } finally {
      Object.defineProperty(globalThis.window, 'innerWidth', {
        value: original,
        configurable: true,
      })
    }
  })

  it('shows the empty state when every row is a placeholder', () => {
    renderPage([ROWS[2]])
    expect(screen.getByText('No payees to show yet')).toBeInTheDocument()
  })
})
