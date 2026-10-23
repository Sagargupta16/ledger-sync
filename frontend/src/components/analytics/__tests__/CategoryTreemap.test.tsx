/**
 * CategoryTreemap draws the expense breakdown the list beside it reads, and its Treemap zooms from the
 * keyboard, a tap, a click and a deep link. Reduced motion paints the final view at once, so tiles and
 * labels are asserted straight after each event; the frame renders at the kit's 640px jsdom width.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { categoryBreakdownOptions } from '@/hooks/api/useAnalytics'
import { formatCurrency } from '@/lib/formatters'
import type { CategoryBreakdown } from '@/services/api/calculations'
import { useMotionStore } from '@/store/motionStore'

import CategoryTreemap from '../CategoryTreemap'

/** Rows in the shape `/api/calculations/category-breakdown` returns. */
const BREAKDOWN: CategoryBreakdown = {
  categories: {
    Housing: { total: 360_000, count: 12, percentage: 72, subcategories: { Rent: 300_000, Maintenance: 60_000 } },
    'Food & Dining': { total: 100_000, count: 40, percentage: 20, subcategories: { Groceries: 70_000, Restaurants: 30_000 } },
    Travel: { total: 40_000, count: 2, percentage: 8, subcategories: {} },
  },
  total: 500_000,
}
const JOIN = '\u001f'

function renderTreemap(categoryFilter?: string | null, breakdown: CategoryBreakdown = BREAKDOWN) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(
    categoryBreakdownOptions({ transaction_type: 'expense', start_date: undefined, end_date: undefined }).queryKey,
    breakdown,
  )
  return render(
    <QueryClientProvider client={client}>
      <CategoryTreemap categoryFilter={categoryFilter} />
    </QueryClientProvider>,
  )
}

const chart = () => screen.getByRole('img', { name: /treemap of expenses/i })
const crumbs = () => screen.getByRole('navigation', { name: 'Treemap level' })
const tileKeys = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('path[data-tile]'), (path) => path.getAttribute('data-tile'))
const tile = (container: HTMLElement, key: string) => {
  const path = container.querySelector(`path[data-tile="${key}"]`)
  if (!path) throw new Error(`no tile ${key}`)
  return path
}
const spoken = (container: HTMLElement) => container.querySelector('[aria-live="polite"]')?.textContent ?? ''

describe('CategoryTreemap', () => {
  beforeEach(() => useMotionStore.getState().setMode('reduced'))
  afterEach(() => useMotionStore.getState().setMode('full'))

  it('draws one labelled tile per category and lists every row in a table beside the chart', () => {
    const { container } = renderTreemap()

    expect(tileKeys(container)).toEqual(['Housing', 'Food & Dining', 'Travel'])
    const labels = Array.from(container.querySelectorAll('svg text'), (text) => text.textContent)
    expect(labels).toEqual([
      `Housing${formatCurrency(360_000)}`,
      `Food & Dining${formatCurrency(100_000)}`,
      `Travel${formatCurrency(40_000)}`,
    ])
    const table = screen.getByRole('table', { name: 'Expense Map data' })
    expect(chart().contains(table)).toBe(false)
    expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'Housing', 'Housing / Rent', 'Housing / Maintenance',
      'Food & Dining', 'Food & Dining / Groceries', 'Food & Dining / Restaurants', 'Travel',
    ])
  })

  it('walks tiles with the arrow keys, opens one with Enter and goes back with Escape and Backspace', () => {
    const { container } = renderTreemap()

    fireEvent.keyDown(chart(), { key: 'ArrowRight' })
    expect(spoken(container)).toBe(`Housing: ${formatCurrency(360_000)}, 72.0% of total. Press Enter to open it`)
    fireEvent.keyDown(chart(), { key: 'End' })
    expect(spoken(container)).toBe(`Travel: ${formatCurrency(40_000)}, 8.0% of total`)
    fireEvent.keyDown(chart(), { key: 'Home' })
    fireEvent.keyDown(chart(), { key: 'ArrowDown' })
    expect(spoken(container)).toMatch(/^Food & Dining: /)

    fireEvent.keyDown(chart(), { key: 'Enter' })
    expect(within(crumbs()).getByRole('button', { name: 'All expenses' })).toBeInTheDocument()
    expect(within(crumbs()).getByText('Food & Dining')).toHaveAttribute('aria-current', 'location')
    expect(tileKeys(container)).toEqual([
      'Housing', 'Food & Dining', 'Travel', `Food & Dining${JOIN}Groceries`, `Food & Dining${JOIN}Restaurants`,
    ])
    expect(spoken(container)).toBe(
      `Food & Dining: 2 subcategories, ${formatCurrency(100_000)}. Groceries: ${formatCurrency(70_000)}, 70.0% of Food & Dining`,
    )

    fireEvent.keyDown(chart(), { key: 'Escape' })
    expect(within(crumbs()).queryByRole('button')).toBeNull()
    expect(tileKeys(container)).toEqual(['Housing', 'Food & Dining', 'Travel'])
    expect(spoken(container)).toMatch(/^All expenses: 3 categories, .+\. Food & Dining: /)

    fireEvent.keyDown(chart(), { key: ' ' })
    fireEvent.keyDown(chart(), { key: 'Backspace' })
    expect(within(crumbs()).getByText('All expenses')).toHaveAttribute('aria-current', 'location')
  })

  it('reads a tile on the first tap and opens it on the second', () => {
    const { container } = renderTreemap()

    fireEvent.pointerUp(tile(container, 'Housing'), { pointerType: 'touch' })
    expect(screen.getByRole('button', { name: 'Open Housing' })).toBeInTheDocument()
    expect(within(crumbs()).queryByRole('button')).toBeNull()

    fireEvent.pointerUp(tile(container, 'Housing'), { pointerType: 'touch' })
    expect(within(crumbs()).getByText('Housing')).toHaveAttribute('aria-current', 'location')
    expect(tileKeys(container)).toContain(`Housing${JOIN}Rent`)
  })

  it('opens from the Open control and hands focus to the chart when the control goes away', () => {
    const { container } = renderTreemap()

    fireEvent.pointerUp(tile(container, 'Food & Dining'), { pointerType: 'touch' })
    fireEvent.click(screen.getByRole('button', { name: 'Open Food & Dining' }))

    expect(within(crumbs()).getByText('Food & Dining')).toHaveAttribute('aria-current', 'location')
    expect(document.activeElement).toBe(chart())
  })

  it('opens a category on a mouse click, leaves an empty one closed, and goes back from the breadcrumb', () => {
    const { container } = renderTreemap()

    fireEvent.pointerUp(tile(container, 'Travel'), { pointerType: 'mouse' })
    expect(within(crumbs()).queryByRole('button')).toBeNull()

    fireEvent.pointerUp(tile(container, 'Housing'), { pointerType: 'mouse' })
    expect(within(crumbs()).getByText('Housing')).toHaveAttribute('aria-current', 'location')

    fireEvent.click(within(crumbs()).getByRole('button', { name: 'All expenses' }))
    expect(within(crumbs()).getByText('All expenses')).toHaveAttribute('aria-current', 'location')
    expect(tileKeys(container)).toEqual(['Housing', 'Food & Dining', 'Travel'])
    expect(document.activeElement).toBe(chart())
  })

  it('opens a deep-linked category on arrival and ignores one it does not have', () => {
    const { container, unmount } = renderTreemap('Food & Dining')
    expect(within(crumbs()).getByText('Food & Dining')).toHaveAttribute('aria-current', 'location')
    expect(tileKeys(container)).toContain(`Food & Dining${JOIN}Groceries`)
    unmount()

    renderTreemap('Gone')
    expect(within(crumbs()).getByText('All expenses')).toHaveAttribute('aria-current', 'location')
  })

  it('shows an empty state when there is no spending to map', () => {
    renderTreemap(null, { categories: {}, total: 0 })

    expect(screen.getByText('No expenses to map')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /treemap of expenses/i })).toBeNull()
  })
})
