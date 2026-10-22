import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ChartSeriesLegend from '../ChartSeriesLegend'

const ITEMS = [
  { key: 'income', label: 'Income', color: '#000000', value: '₹5,000' },
  { key: 'expense', label: 'Expense', color: '#111111', value: '₹3,000' },
  { key: 'savings', label: 'Savings', color: '#222222', value: '₹2,000' },
]

describe('ChartSeriesLegend without onToggle', () => {
  it('lists every series as static text with its reading, ignoring `hidden`', () => {
    render(<ChartSeriesLegend items={ITEMS} hidden={new Set(['savings'])} caption="Latest: March 2026" />)

    const list = screen.getByRole('list', { name: 'Chart series' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(within(list).getByText('Savings')).not.toHaveClass('line-through')
    expect(within(list).getByText('₹2,000')).toHaveClass('text-foreground')
    expect(screen.getByText('Latest: March 2026')).toBeInTheDocument()
  })
})

describe('ChartSeriesLegend with onToggle', () => {
  it('makes each item a toggle button, pressed while its series is drawn', () => {
    const onToggle = vi.fn()
    render(<ChartSeriesLegend items={ITEMS} hidden={new Set(['savings'])} onToggle={onToggle} />)

    expect(screen.getByRole('list', { name: 'Show or hide chart series' })).toBeInTheDocument()
    const income = screen.getByRole('button', { name: 'Income ₹5,000' })
    const savings = screen.getByRole('button', { name: 'Savings ₹2,000' })
    expect(income).toHaveAttribute('type', 'button')
    expect(income).toHaveAttribute('aria-pressed', 'true')
    expect(savings).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(income)
    fireEvent.click(savings)
    expect(onToggle.mock.calls).toEqual([['income'], ['savings']])
  })

  it('keeps a hidden item swatch and label, fading the swatch and muting the text', () => {
    render(<ChartSeriesLegend items={ITEMS} hidden={new Set(['savings'])} onToggle={() => {}} />)

    const savings = screen.getByRole('button', { name: 'Savings ₹2,000' })
    expect(savings.querySelector('[aria-hidden="true"]')).toHaveClass('opacity-40')
    expect(within(savings).getByText('Savings')).toHaveClass('line-through')
    expect(within(savings).getByText('₹2,000')).toHaveClass('text-muted-foreground')

    const income = screen.getByRole('button', { name: 'Income ₹5,000' })
    expect(income.querySelector('[aria-hidden="true"]')).not.toHaveClass('opacity-40')
    expect(within(income).getByText('Income')).not.toHaveClass('line-through')
    expect(within(income).getByText('₹5,000')).toHaveClass('text-foreground')
  })

  it('locks the last shown series on, so the plot never empties', () => {
    const onToggle = vi.fn()
    render(<ChartSeriesLegend items={ITEMS} hidden={new Set(['expense', 'savings'])} onToggle={onToggle} />)

    const income = screen.getByRole('button', { name: 'Income ₹5,000' })
    expect(income).toHaveAttribute('aria-pressed', 'true')
    expect(income).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(income)
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Expense ₹3,000' })).not.toHaveAttribute('aria-disabled')
  })

  it('prints the drawn series as the static list, since paper hides every button', () => {
    render(<ChartSeriesLegend items={ITEMS} hidden={new Set(['savings'])} onToggle={() => {}} />)

    fireEvent(globalThis.window, new Event('beforeprint'))
    try {
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      const list = screen.getByRole('list', { name: 'Chart series' })
      expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Income₹5,000',
        'Expense₹3,000',
      ])
    } finally {
      fireEvent(globalThis.window, new Event('afterprint'))
    }
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})
