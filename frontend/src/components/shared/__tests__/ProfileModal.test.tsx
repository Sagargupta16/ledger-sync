import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/authStore'
import { useMotionStore } from '@/store/motionStore'
import Sidebar from '@/components/layout/Sidebar/Sidebar'
import ProfileModal from '../ProfileModal'

const mutations = vi.hoisted(() => ({
  profile: { mutate: vi.fn(), isPending: false },
  reset: { mutate: vi.fn(), isPending: false },
  delete: { mutate: vi.fn(), isPending: false },
  logout: { mutate: vi.fn(), isPending: false },
}))

vi.mock('@/hooks/api/useAuth', () => ({
  useUpdateProfile: () => mutations.profile,
  useResetAccount: () => mutations.reset,
  useDeleteAccount: () => mutations.delete,
  useLogout: () => mutations.logout,
}))

vi.mock('@/hooks/api/useAnalyticsV2', () => ({
  useBudgets: () => ({ data: [] }),
  useAnomalies: () => ({ data: [] }),
  useRecurringTransactions: () => ({ data: [] }),
}))
vi.mock('@/components/layout/Sidebar/CurrencySwitcher', () => ({ default: () => null }))

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <MemoryRouter>
      <div data-testid="workspace">
        <button onClick={() => setOpen(true)}>Open profile</button>
        <ProfileModal open={open} onOpenChange={setOpen} />
      </div>
    </MemoryRouter>
  )
}

function openProfile() {
  const trigger = screen.getByRole('button', { name: 'Open profile' })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

beforeEach(() => {
  useAuthStore.setState({ user: {
    id: 1, full_name: 'Alex Example', email: 'alex@example.test',
    is_active: true, is_verified: true, auth_provider: 'google',
    created_at: '2024-02-01T12:00:00Z', last_login: null,
  } })
  useMotionStore.setState({ mode: 'reduced' })
})

afterEach(() => {
  for (const mutation of Object.values(mutations)) {
    mutation.mutate.mockReset()
    mutation.isPending = false
  }
  useAuthStore.setState({ user: null })
  useMotionStore.setState({ mode: 'full' })
})

describe('profile account interactions', () => {
  it.each(['full', 'reduced'] as const)('opens from the mobile sidebar without competing focus traps in %s motion', async (mode) => {
    useMotionStore.setState({ mode })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><Sidebar /></MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const trigger = screen.getByRole('button', { name: 'Open profile and account' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Profile & account' })
    const close = within(dialog).getByRole('button', { name: 'Close profile' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(within(dialog).getByRole('button', { name: 'Sign out' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('portals outside the workspace, traps focus, and restores focus and scrolling on close', async () => {
    render(<Harness />)
    const priorOverflow = document.body.style.overflow
    const trigger = openProfile()
    const dialog = screen.getByRole('dialog', { name: 'Profile & account' })
    const close = within(dialog).getByRole('button', { name: 'Close profile' })
    const signOut = within(dialog).getByRole('button', { name: 'Sign out' })

    expect(screen.getByTestId('workspace')).not.toContainElement(dialog)
    expect(document.body.style.overflow).toBe('hidden')
    expect(close).toHaveFocus()
    signOut.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(signOut).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe(priorOverflow)
  })

  it('cancels name editing with Escape without closing the profile', () => {
    render(<Harness />)
    openProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Edit display name' }))
    const name = screen.getByRole('textbox', { name: 'Display name' })
    expect(name).toHaveFocus()
    fireEvent.change(name, { target: { value: 'Unsaved name' } })
    fireEvent.keyDown(name, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit display name' })).toHaveFocus()
    expect(mutations.profile.mutate).not.toHaveBeenCalled()
  })

  it('submits a trimmed name and prevents blank or unchanged submissions', () => {
    render(<Harness />)
    openProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Edit display name' }))
    const name = screen.getByRole('textbox', { name: 'Display name' })
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()
    fireEvent.submit(name.closest('form')!)
    expect(mutations.profile.mutate).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()
    fireEvent.submit(name.closest('form')!)
    expect(mutations.profile.mutate).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: ' Alex Updated ' } })
    fireEvent.submit(name.closest('form')!)
    expect(mutations.profile.mutate).toHaveBeenCalledWith('Alex Updated', expect.any(Object))
  })

  it('keeps one destructive confirmation open and clears its keyword when switching', () => {
    render(<Harness />)
    openProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Reset transactions' }))
    const resetInput = screen.getByRole('textbox', { name: 'Confirmation text for Reset transactions' })
    const clear = screen.getByRole('button', { name: 'Clear transactions' })
    expect(clear).toBeDisabled()
    fireEvent.change(resetInput, { target: { value: 'reset' } })
    fireEvent.submit(resetInput.closest('form')!)
    expect(mutations.reset.mutate).not.toHaveBeenCalled()
    fireEvent.change(resetInput, { target: { value: 'RESET' } })
    expect(clear).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.queryByRole('textbox', { name: 'Confirmation text for Reset transactions' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Confirmation text for Delete account' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Permanently delete account' })).toBeDisabled()
    expect(mutations.reset.mutate).not.toHaveBeenCalled()
  })

  it('preserves the transaction-only reset mode and blocks competing actions while pending', () => {
    const view = render(<Harness />)
    openProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Reset transactions' }))
    const input = screen.getByRole('textbox', { name: 'Confirmation text for Reset transactions' })
    fireEvent.change(input, { target: { value: 'RESET' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear transactions' }))
    expect(mutations.reset.mutate).toHaveBeenCalledWith('transactions', expect.any(Object))
    expect(mutations.delete.mutate).not.toHaveBeenCalled()
    mutations.reset.isPending = true
    view.rerender(<Harness />)
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled()
  })
})
