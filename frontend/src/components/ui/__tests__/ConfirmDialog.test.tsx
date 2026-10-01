import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import ConfirmDialog from '../ConfirmDialog'

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Delete entry?',
  description: 'This action cannot be undone.',
  onConfirm: vi.fn(),
}

// jsdom has no native modal lifecycle. Mirror the parts the dialog relies on:
// showModal/close toggle `open`, and showModal moves focus to the first control.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
    this.querySelector<HTMLElement>('button')?.focus()
  }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

describe('ConfirmDialog', () => {
  it.each([
    ['danger', 'bg-app-red'],
    ['warning', 'bg-app-orange/90'],
  ] as const)('preserves the %s confirm action styling', (variant, expectedClass) => {
    render(
      <ConfirmDialog
        {...defaultProps}
        variant={variant}
        confirmLabel="Continue"
      />,
    )

    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass(expectedClass)
  })

  it('closes from the cancel button, Escape, and the overlay', () => {
    const onOpenChange = vi.fn()
    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />)

    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(dialog)
    fireEvent.click(screen.getByText('This action cannot be undone.'))
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    // Escape on a modal <dialog> arrives as a cancelable `cancel` event.
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog, cancel)
    expect(cancel.defaultPrevented).toBe(true)
    fireEvent.click(dialog.firstElementChild as HTMLElement)

    expect(onOpenChange).toHaveBeenCalledTimes(3)
    expect(onOpenChange).toHaveBeenNthCalledWith(1, false)
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false)
    expect(onOpenChange).toHaveBeenNthCalledWith(3, false)
  })

  it('waits for an async confirmation before closing', async () => {
    let resolveConfirmation: () => void = () => {}
    const confirmation = new Promise<void>((resolve) => {
      resolveConfirmation = resolve
    })
    const onConfirm = vi.fn(() => confirmation)
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        {...defaultProps}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).not.toHaveBeenCalled()

    await act(async () => {
      resolveConfirmation()
      await confirmation
    })

    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens as a native modal, focuses the safe action, and restores focus on close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open confirm</button>
          <ConfirmDialog {...defaultProps} open={open} onOpenChange={setOpen} />
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open confirm' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('alertdialog', { name: 'Delete entry?' })
    expect(dialog).toBeInstanceOf(HTMLDialogElement)
    expect((dialog as HTMLDialogElement).open).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument(), { timeout: 3000 })
    expect(trigger).toHaveFocus()
  })
})
