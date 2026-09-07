import type { ComponentProps } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PeriodPicker } from '../PeriodPicker'

type Props = ComponentProps<typeof PeriodPicker>

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    value: 'last_3_months',
    onChange: vi.fn(),
    customStart: '2026-01-01',
    customEnd: '2026-06-30',
    onCustomChange: vi.fn(),
    minDate: '2025-01-01T00:00:00',
    maxDate: '2026-08-31T00:00:00',
    ...overrides,
  }
}

function openDialog() {
  const trigger = screen.getByRole('button', { name: 'Custom' })
  trigger.focus()
  fireEvent.click(trigger)
  return {
    dialog: screen.getByRole('dialog', { name: 'Custom date range' }),
    trigger,
  }
}

describe('PeriodPicker custom range dialog', () => {
  it('focuses the first date field when opened', async () => {
    render(<PeriodPicker {...makeProps()} />)

    openDialog()

    await waitFor(() => expect(screen.getByLabelText('From')).toHaveFocus())
  })

  it('wraps focus in both directions', async () => {
    render(<PeriodPicker {...makeProps()} />)
    openDialog()

    const first = screen.getByLabelText('From')
    const last = screen.getByRole('button', { name: 'Apply' })
    await waitFor(() => expect(first).toHaveFocus())

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it.each(['Escape', 'backdrop'] as const)(
    'closes with %s and restores focus to the trigger',
    async (closeMethod) => {
      render(<PeriodPicker {...makeProps()} />)
      const { dialog, trigger } = openDialog()
      await waitFor(() => expect(screen.getByLabelText('From')).toHaveFocus())

      if (closeMethod === 'Escape') {
        fireEvent.keyDown(document, { key: 'Escape' })
      } else {
        fireEvent.click(dialog.parentElement as HTMLElement)
      }

      await waitFor(() => expect(dialog).not.toBeInTheDocument())
      await waitFor(() => expect(trigger).toHaveFocus())
    },
  )
})
