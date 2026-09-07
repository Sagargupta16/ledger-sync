import type { ComponentProps } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import BillCalendarGrid from '../BillCalendarGrid'

type Props = ComponentProps<typeof BillCalendarGrid>

const calendarGrid: Props['calendarGrid'] = [
  { day: 31, month: 4, year: 2026, isCurrentMonth: false },
  ...Array.from({ length: 30 }, (_, index) => ({
    day: index + 1,
    month: 5,
    year: 2026,
    isCurrentMonth: true,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    day: index + 1,
    month: 6,
    year: 2026,
    isCurrentMonth: false,
  })),
]

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    now: new Date(2026, 5, 15),
    viewYear: 2026,
    viewMonth: 5,
    selectedDay: null,
    billMap: new Map(),
    calendarGrid,
    maxBillAmount: 0,
    isLoading: false,
    hasAnyData: true,
    isCurrentViewToday: true,
    onPreviousMonth: vi.fn(),
    onNextMonth: vi.fn(),
    onToday: vi.fn(),
    onSelectDay: vi.fn(),
    ...overrides,
  }
}

function getDay(day: number): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-bill-calendar-day="${day}"]`,
  )
  if (!button) throw new Error(`Calendar day ${day} was not rendered`)
  return button
}

function activateWithKeyboard(button: HTMLButtonElement, key: 'Enter' | ' ') {
  expect(fireEvent.keyDown(button, { key })).toBe(true)
  if (key === 'Enter') fireEvent.click(button)
  fireEvent.keyUp(button, { key })
  if (key === ' ') fireEvent.click(button)
}

class IntersectionObserverStub {
  disconnect() {
    return undefined
  }

  observe() {
    return undefined
  }

  takeRecords() {
    return []
  }

  unobserve() {
    return undefined
  }
}

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('BillCalendarGrid keyboard navigation', () => {
  it('exposes exactly one tabbable enabled day', () => {
    render(<BillCalendarGrid {...makeProps()} />)

    const calendar = screen.getByRole('group', { name: 'June 2026 calendar' })
    const enabledDays = [
      ...calendar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ]
    const tabbableDays = enabledDays.filter((button) => button.tabIndex === 0)

    expect(enabledDays).toHaveLength(30)
    expect(tabbableDays).toEqual([getDay(15)])
  })

  it.each([
    ['ArrowLeft', 14],
    ['ArrowRight', 16],
    ['ArrowUp', 8],
    ['ArrowDown', 22],
  ])('moves focus with %s', async (key, expectedDay) => {
    render(<BillCalendarGrid {...makeProps()} />)
    getDay(15).focus()

    fireEvent.keyDown(getDay(15), { key })

    await waitFor(() => expect(getDay(expectedDay)).toHaveFocus())
    expect(getDay(expectedDay)).toHaveAttribute('tabindex', '0')
  })

  it('moves to the first and last day with Home and End', async () => {
    render(<BillCalendarGrid {...makeProps()} />)
    getDay(15).focus()

    fireEvent.keyDown(getDay(15), { key: 'Home' })
    await waitFor(() => expect(getDay(1)).toHaveFocus())

    fireEvent.keyDown(getDay(1), { key: 'End' })
    await waitFor(() => expect(getDay(30)).toHaveFocus())
  })

  it('keeps focus inside the current month at every arrow boundary', async () => {
    render(<BillCalendarGrid {...makeProps()} />)

    getDay(1).focus()
    fireEvent.keyDown(getDay(1), { key: 'ArrowLeft' })
    await waitFor(() => expect(getDay(1)).toHaveFocus())
    fireEvent.keyDown(getDay(1), { key: 'ArrowUp' })
    await waitFor(() => expect(getDay(1)).toHaveFocus())

    getDay(30).focus()
    fireEvent.keyDown(getDay(30), { key: 'ArrowRight' })
    await waitFor(() => expect(getDay(30)).toHaveFocus())
    fireEvent.keyDown(getDay(30), { key: 'ArrowDown' })
    await waitFor(() => expect(getDay(30)).toHaveFocus())

    const adjacentMonthDays = screen.getAllByRole('button', {
      name: /outside the current month/i,
    })
    expect(adjacentMonthDays).toHaveLength(5)
    expect(adjacentMonthDays.every((button) => button.tabIndex === -1)).toBe(true)
  })

  it('selects and clears a day through native keyboard activation', () => {
    const onSelectDay = vi.fn()
    const { rerender } = render(
      <BillCalendarGrid {...makeProps({ onSelectDay })} />,
    )

    activateWithKeyboard(getDay(12), 'Enter')
    expect(onSelectDay).toHaveBeenLastCalledWith(12)

    rerender(
      <BillCalendarGrid
        {...makeProps({
          selectedDay: 12,
          onSelectDay,
        })}
      />,
    )
    activateWithKeyboard(getDay(12), ' ')
    expect(onSelectDay).toHaveBeenLastCalledWith(null)
  })
})
