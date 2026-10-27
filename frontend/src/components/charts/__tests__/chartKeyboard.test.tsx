import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMotionStore } from '@/store/motionStore'

import CartesianChart from '../CartesianChart'
import PieChart from '../PieChart'
import RadarChart from '../RadarChart'

/**
 * Keyboard inspection on a focused chart frame: arrows step, Home and End jump to either end, and
 * Page Up and Page Down stride a tenth of an x/y chart's rows. Up, Right and Page Up move forward
 * and Down, Left and Page Down back, as on ChartBrush's sliders; a vertical ranking runs down the
 * screen, so there Down and Page Down move to the next row. `fireEvent` returns false once the
 * chart called preventDefault, which is what keeps the page from scrolling under it. jsdom has no
 * ResizeObserver, so the kit paints at its 640px fallback width; reduced motion draws final
 * geometry at once.
 */
const ROWS = Array.from({ length: 25 }, (_, index) => ({ month: `M${index + 1}`, total: (index + 1) * 100 }))
const SERIES = [{ key: 'total' }]

const SLICES = [
  { key: 'rent', label: 'Rent', value: 500, color: '#111111' },
  { key: 'food', label: 'Food', value: 300, color: '#222222' },
  { key: 'travel', label: 'Travel', value: 200, color: '#333333' },
]

const AXES = [
  { key: 'savings', label: 'Savings' },
  { key: 'debt', label: 'Debt' },
  { key: 'spending', label: 'Spending' },
  { key: 'cover', label: 'Cover' },
]
const PROFILE = [{ key: 'you', label: 'You', color: '#111111', values: { savings: 80, debt: 60, spending: 40, cover: 20 } }]
/** The no-break space the radar puts between an axis label and its scores. */
const NBSP = String.fromCharCode(0xa0)

beforeEach(() => {
  useMotionStore.getState().setMode('reduced')
})

// Unmount first, so restoring full motion cannot re-render a chart outside act().
afterEach(() => {
  cleanup()
  useMotionStore.getState().setMode('full')
})

/** The 25-row chart, zoomed to `visibleRange` when given, and a key press that reports what it did. */
function renderRows(visibleRange?: { startIndex: number; endIndex: number }, layout?: 'horizontal' | 'vertical') {
  const onActiveIndexChange = vi.fn<(index: number | null) => void>()
  render(
    <CartesianChart data={ROWS} categoryKey="month" series={SERIES} visibleRange={visibleRange} layout={layout}
      ariaLabel="Monthly totals" onActiveIndexChange={onActiveIndexChange}>
      {null}
    </CartesianChart>,
  )
  const frame = screen.getByRole('img', { name: 'Monthly totals' })
  // The row the press reported (undefined for none), and whether it kept the page from scrolling.
  return (key: string) => {
    onActiveIndexChange.mockClear()
    const prevented = !fireEvent.keyDown(frame, { key })
    return { row: onActiveIndexChange.mock.lastCall?.[0], prevented }
  }
}

/** The axis label carrying scores, which only the active axis shows. */
function scoredAxis(frame: HTMLElement): string | undefined {
  return Array.from(frame.querySelectorAll('text'), (text) => text.textContent ?? '').find((label) => label.includes(NBSP))
}

describe('CartesianChart keyboard', () => {
  it('jumps to either end with Home and End, and pages a tenth of the rows, clamped', () => {
    const press = renderRows()
    // 25 rows make a page of round(2.5) = 3 rows; a page past either end stops there.
    const keys = ['End', 'PageDown', 'PageDown', 'PageUp', 'PageUp', 'PageUp', 'Home', 'PageDown', 'PageUp']
    const presses = keys.map((key) => press(key))

    expect(presses.map(({ row }) => row)).toEqual([24, 21, 18, 21, 24, 24, 0, 0, 3])
    expect(presses.every(({ prevented }) => prevented)).toBe(true)
  })

  it('enters at the first row on Page Up like an arrow, steps forward on Right and Up, back on Left and Down, and keeps Escape and other keys as they were', () => {
    const press = renderRows()

    expect(press('PageUp')).toEqual({ row: 0, prevented: true })
    expect(press('ArrowRight')).toEqual({ row: 1, prevented: true })
    expect(press('ArrowUp')).toEqual({ row: 2, prevented: true })
    expect(press('ArrowDown')).toEqual({ row: 1, prevented: true })
    expect(press('ArrowLeft')).toEqual({ row: 0, prevented: true })
    expect(press('ArrowDown')).toEqual({ row: 0, prevented: true })
    expect(press('Escape')).toEqual({ row: null, prevented: false })
    expect(press('Tab')).toEqual({ row: undefined, prevented: false })
  })

  it('counts visible rows: End stops at the end of a zoomed window and a page is never under one row', () => {
    // Rows 10 to 13 are plotted. A page of round(0.4) would be 0 rows, so it is one.
    const press = renderRows({ startIndex: 10, endIndex: 13 })

    expect(['End', 'PageDown', 'PageDown', 'Home', 'PageUp'].map((key) => press(key).row)).toEqual([3, 2, 1, 0, 1])
  })

  it('reads a vertical ranking top to bottom: Down and Page Down move to the next row, Up and Page Up back', () => {
    const press = renderRows(undefined, 'vertical')

    expect(['ArrowDown', 'ArrowDown', 'PageDown', 'ArrowUp', 'PageUp', 'ArrowRight'].map((key) => press(key).row))
      .toEqual([0, 1, 4, 3, 0, 1])
  })
})

describe('PieChart and RadarChart keyboard', () => {
  it('jumps a pie to its first and last slice with Home and End', () => {
    const onActiveChange = vi.fn<(key: string | null) => void>()
    render(<PieChart data={SLICES} onActiveChange={onActiveChange} ariaLabel="Spending split" />)
    const frame = screen.getByRole('img', { name: 'Spending split' })

    expect(fireEvent.keyDown(frame, { key: 'End' })).toBe(false)
    expect(onActiveChange).toHaveBeenLastCalledWith('travel')
    // The arrows carry on from the slice a jump picked.
    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    expect(onActiveChange).toHaveBeenLastCalledWith('food')
    expect(fireEvent.keyDown(frame, { key: 'Home' })).toBe(false)
    expect(onActiveChange).toHaveBeenLastCalledWith('rent')
  })

  it('jumps a radar to its first and last axis with Home and End', () => {
    render(<RadarChart axes={AXES} series={PROFILE} ariaLabel="Health profile" />)
    const frame = screen.getByRole('img', { name: 'Health profile' })

    expect(fireEvent.keyDown(frame, { key: 'End' })).toBe(false)
    expect(scoredAxis(frame)).toBe(`Cover${NBSP}20`)
    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    expect(scoredAxis(frame)).toBe(`Spending${NBSP}40`)
    expect(fireEvent.keyDown(frame, { key: 'Home' })).toBe(false)
    expect(scoredAxis(frame)).toBe(`Savings${NBSP}80`)
  })
})
