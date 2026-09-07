import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ConfirmDialog from '../ConfirmDialog'

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Delete entry?',
  description: 'This action cannot be undone.',
  onConfirm: vi.fn(),
}

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
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(dialog.parentElement as HTMLElement)

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
})
