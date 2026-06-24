import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TransactionFilters, { type FilterValues } from '../TransactionFilters'

const CATEGORIES = ['Food', 'Travel']
const ACCOUNTS = ['HDFC', 'ICICI']

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function lastCall(onChange: ReturnType<typeof vi.fn>): FilterValues {
  return onChange.mock.calls.at(-1)?.[0] as FilterValues
}

describe('TransactionFilters debounced search', () => {
  it('does not emit a filter change on initial mount', () => {
    const onFilterChange = vi.fn()
    render(
      <TransactionFilters onFilterChange={onFilterChange} categories={CATEGORIES} accounts={ACCOUNTS} />,
    )
    act(() => vi.advanceTimersByTime(500))
    expect(onFilterChange).not.toHaveBeenCalled()
  })

  it('debounces the search query before emitting', () => {
    const onFilterChange = vi.fn()
    render(
      <TransactionFilters onFilterChange={onFilterChange} categories={CATEGORIES} accounts={ACCOUNTS} />,
    )
    const search = screen.getByPlaceholderText(/search/i)

    fireEvent.change(search, { target: { value: 'coffee' } })
    // Before the debounce window elapses, nothing is emitted.
    act(() => vi.advanceTimersByTime(200))
    expect(onFilterChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(150))
    expect(lastCall(onFilterChange)).toEqual({ query: 'coffee' })
  })

  it('merges the debounced query with the LATEST dropdown filter (no stale snapshot)', () => {
    const onFilterChange = vi.fn()
    render(
      <TransactionFilters onFilterChange={onFilterChange} categories={CATEGORIES} accounts={ACCOUNTS} />,
    )

    // 1. Open advanced filters and pick a type (immediate, non-debounced).
    fireEvent.click(screen.getByLabelText(/show filters/i))
    fireEvent.change(screen.getByLabelText(/filter by transaction type/i), {
      target: { value: 'Expense' },
    })
    expect(lastCall(onFilterChange)).toEqual({ type: 'Expense' })

    // 2. Type a search query. When it debounces, it must combine with the
    //    category chosen in step 1 -- this is the stale-closure case the
    //    useEffectEvent refactor guards against.
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'uber' } })
    act(() => vi.advanceTimersByTime(350))

    expect(lastCall(onFilterChange)).toEqual({ type: 'Expense', query: 'uber' })
  })
})
