/**
 * Guards the divisor named on the CategoryBreakdown monthly-average label.
 *
 * The row printed a flat "<amount>/mo avg" from `averagePerActiveMonth`, which
 * divides by the months that HAD spend -- inches from a sparkline titled "last
 * 12 months". A category with spend in 2 of those 12 months therefore advertised
 * a figure 6.0x its own 12-month monthly average as if it were the same
 * statistic. The mean is legitimate; the unqualified label was not, so the
 * divisor now travels with the number.
 *
 * Both halves are pinned: the pure label builder (every divisor case, including
 * the one where a truncating phone viewport would have to eat something) and the
 * rendered row, so the component is proved to be reading the builder rather than
 * formatting its own string.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { TrendingDown } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { categoryBreakdownOptions } from '@/hooks/api/useAnalytics'
// Aliased: the default export below is a COMPONENT of the same name.
import type { CategoryBreakdown as CategoryBreakdownResponse } from '@/services/api/calculations'

import CategoryBreakdown from '../CategoryBreakdown'
import { averagePerActiveMonth, monthlyAvgLabel, trailingMonthKeys } from '../categoryBreakdownUtils'

const money = (v: number) => `Rs${Math.round(v)}`

/** A trailing-12 series with `active` non-zero months, all of `each`. */
function series(active: number, each: number): number[] {
  return Array.from({ length: 12 }, (_, i) => (i < active ? each : 0))
}

describe('monthlyAvgLabel', () => {
  it('names the sparse divisor, so the figure cannot pass as a 12-month average', () => {
    // 2 months of 30,000 is 5,000/mo across the 12 months the sparkline plots,
    // but 30,000 per month in which anything was spent. That 6.0x gap is the
    // defect; the label has to say which one it is.
    expect(monthlyAvgLabel(series(2, 30_000), money)).toBe('Rs30000/mo in 2 of 12 mo')
    expect(averagePerActiveMonth(series(2, 30_000))).toBe(30_000)
    expect(series(2, 30_000).reduce((s, m) => s + m, 0) / 12).toBe(5_000)
  })

  it('drops the qualifier only when every month is active', () => {
    expect(monthlyAvgLabel(series(12, 6_000), money)).toBe('Rs6000/mo over 12 mo')
  })

  it('reports the window it was handed, not a hardcoded 12', () => {
    // Guards against the divisor being narrated from a literal: a 6-month
    // series must say 6, and the shorter window is what a fresh account has.
    expect(monthlyAvgLabel([0, 900, 0, 0, 0, 0], money)).toBe('Rs900/mo in 1 of 6 mo')
  })

  it('returns null when there is nothing to average', () => {
    // Rendering "Rs0/mo in 0 of 12 mo" would be a fact about nothing.
    expect(monthlyAvgLabel(series(0, 0), money)).toBeNull()
    expect(monthlyAvgLabel([], money)).toBeNull()
  })

  it('leads with the amount, so a truncating row clips the qualifier not the digits', () => {
    // The meta line is `truncate` inside a `min-w-0` flex child, so on a phone
    // the TAIL is what an ellipsis eats. A qualifier-first string would cut the
    // money instead -- the "Rs12,91" class this repo already paid for once.
    const label = monthlyAvgLabel(series(3, 12_910), money) ?? ''
    expect(label.startsWith('Rs')).toBe(true)
    expect(label.indexOf('4303')).toBeLessThan(label.indexOf('3 of 12'))
  })
})

/** Category rows in the shape `/api/calculations/category-breakdown` returns. */
const BREAKDOWN: CategoryBreakdownResponse = {
  categories: {
    Housing: { total: 360_000, count: 12, percentage: 85.7, subcategories: { Rent: 360_000 } },
    Travel: { total: 60_000, count: 2, percentage: 14.3, subcategories: {} },
  },
  total: 420_000,
}

/** Housing every month; Travel in 2 of 12 -- the overstating shape. */
function historyFor(monthKeys: string[]): Record<string, number[]> {
  return {
    Housing: monthKeys.map(() => 30_000),
    Travel: monthKeys.map((_, i) => (i >= monthKeys.length - 2 ? 30_000 : 0)),
  }
}

function renderBreakdown() {
  const monthKeys = trailingMonthKeys(12)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seeded through the shared option factory; the history key is the component's
  // own literal, which carries the computed month window.
  qc.setQueryData(
    categoryBreakdownOptions({
      transaction_type: 'expense',
      start_date: undefined,
      end_date: undefined,
    }).queryKey,
    BREAKDOWN,
  )
  qc.setQueryData(['category-monthly-history', 'expense', monthKeys], historyFor(monthKeys))
  return render(
    <QueryClientProvider client={qc}>
      <CategoryBreakdown
        transactionType="expense"
        headerIcon={TrendingDown}
        headerIconColor="text-app-red"
        headerTitle="Spending by Category"
        emptyIcon={TrendingDown}
        emptyTitle="No spending"
        emptyDescription="Upload data"
      />
    </QueryClientProvider>,
  )
}

describe('CategoryBreakdown monthly-average row label', () => {
  beforeEach(() => {
    // Date only: MetricCard-style count-ups and motion run on rAF/timeouts.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('qualifies a sparse category and never prints the bare "/mo avg" claim', () => {
    renderBreakdown()

    // Travel: 60,000 over 12 months is 5,000/mo, but the printed 30,000 is the
    // per-active-month mean -- so the row has to say "in 2 of 12 mo".
    expect(screen.getByText(/₹30,000\/mo in 2 of 12 mo/)).toBeInTheDocument()
    expect(screen.queryByText(/\/mo avg/)).not.toBeInTheDocument()
  })

  it('states the full window for a category active every month', () => {
    renderBreakdown()

    expect(screen.getByText(/₹30,000\/mo over 12 mo/)).toBeInTheDocument()
  })

  it('keeps the label on one line beside the subcategory count at phone width', () => {
    // 375px is where the meta line truncates. The assertion is that the row
    // still renders both clauses joined by the separator (so nothing was
    // dropped) and that the truncate class is present, which is what makes an
    // over-long qualifier degrade to an ellipsis instead of reflowing the row.
    const original = globalThis.window.innerWidth
    Object.defineProperty(globalThis.window, 'innerWidth', { value: 375, configurable: true })
    try {
      renderBreakdown()
      const meta = screen.getByText(/₹30,000\/mo over 12 mo/)
      expect(meta.textContent).toBe('1 subcategory · ₹30,000/mo over 12 mo')
      expect(meta.className).toContain('truncate')
    } finally {
      Object.defineProperty(globalThis.window, 'innerWidth', {
        value: original,
        configurable: true,
      })
    }
  })
})
