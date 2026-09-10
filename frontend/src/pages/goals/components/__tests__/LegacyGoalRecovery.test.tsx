import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useGoals } from '@/hooks/api/useAnalyticsV2'
import type { FinancialGoal, UpdateGoalRequest } from '@/services/api/analyticsV2'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

import { makeRecoveryGoal } from '../../__tests__/goalRecoveryFixtures'
import { LEGACY_GOAL_STORAGE_KEYS as KEYS } from '../../legacyGoalRecovery'
import useLegacyGoalRecovery from '../../useLegacyGoalRecovery'
import LegacyGoalRecovery from '../LegacyGoalRecovery'

const api = vi.hoisted(() => ({
  getGoals: vi.fn<() => Promise<FinancialGoal[]>>(),
  updateGoal: vi.fn<(id: number, data: UpdateGoalRequest) => Promise<FinancialGoal>>(),
  deleteGoal: vi.fn<(id: number) => Promise<{ success: boolean }>>(),
}))

vi.mock('@/services/api/analyticsV2', () => ({ analyticsV2Service: api }))

function RecoveryContent() {
  const query = useGoals({ include_achieved: true })
  const recovery = useLegacyGoalRecovery(query)
  return <LegacyGoalRecovery recovery={recovery} isEditing={false} />
}

function AccountRecovery() {
  const userId = useAuthStore((state) => state.user?.id)
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  return <RecoveryContent key={`${userId}:${isDemoMode}`} />
}

function signIn(id = 71) {
  useAuthStore.getState().login({
    id, email: `review-${id}@example.invalid`, full_name: 'Synthetic reviewer',
    is_active: true, is_verified: true, auth_provider: 'google',
    created_at: '2026-01-01', last_login: null,
  }, { access_token: `synthetic-${id}`, refresh_token: `synthetic-refresh-${id}`, token_type: 'bearer' })
}

function renderRecovery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const result = render(<QueryClientProvider client={client}><AccountRecovery /></QueryClientProvider>)
  return { ...result, client }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function openReview() {
  fireEvent.click(await screen.findByRole('button', { name: 'Review older goal changes' }))
}

function confirmOwnership() {
  fireEvent.click(screen.getByRole('checkbox', { name: /I confirm these are my changes/ }))
}

function selectAllocation() {
  fireEvent.click(screen.getByRole('checkbox', { name: /Recover allocated amount/ }))
  confirmOwnership()
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  useDemoStore.getState().exitDemo()
  signIn()
  api.getGoals.mockResolvedValue([makeRecoveryGoal()])
  api.updateGoal.mockImplementation((id, data) => {
    const saved = makeRecoveryGoal({ ...data, id })
    api.getGoals.mockResolvedValue([saved])
    return Promise.resolve(saved)
  })
  api.deleteGoal.mockImplementation(() => {
    api.getGoals.mockResolvedValue([])
    return Promise.resolve({ success: true })
  })
  // jsdom has no native modal lifecycle; keep the real dialog and its controls.
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

afterEach(() => cleanup())

describe('legacy goal review', () => {
  it('requires review and consent, saves selected fields, and does not offer them again', async () => {
    const allocations = '{"101":75000,"999":90000}'
    const overrides = '{"101":{"name":"Updated fund","target_amount":200000,"target_date":"2028-02-29"}}'
    localStorage.setItem(KEYS.allocations, allocations)
    localStorage.setItem(KEYS.overrides, overrides)
    const view = renderRecovery()

    await openReview()
    expect(screen.getAllByText('Current account')).toHaveLength(4)
    expect(screen.getAllByText('Saved in this browser')).toHaveLength(4)
    expect(screen.getByText('Updated fund')).toBeInTheDocument()
    expect(api.updateGoal).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save selected changes' })).toBeDisabled()
    for (const checkbox of screen.getAllByRole('checkbox', { name: /^Recover / })) fireEvent.click(checkbox)
    expect(screen.getByRole('button', { name: 'Save selected changes' })).toBeDisabled()
    confirmOwnership()
    fireEvent.click(screen.getByRole('button', { name: 'Save selected changes' }))

    await waitFor(() => expect(api.updateGoal).toHaveBeenCalledExactlyOnceWith(101, {
      current_amount: 75_000, name: 'Updated fund', target_amount: 200_000, target_date: '2028-02-29',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Selected goal changes saved.')
    expect(localStorage.getItem(KEYS.allocations)).toBe(allocations)
    expect(localStorage.getItem(KEYS.overrides)).toBe(overrides)

    view.unmount()
    view.client.clear()
    // Even a later server edit must not offer an already reviewed value again.
    api.getGoals.mockResolvedValue([makeRecoveryGoal()])
    renderRecovery()
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(4))
    expect(screen.queryByRole('button', { name: 'Review older goal changes' })).not.toBeInTheDocument()
  })

  it('retains selected inputs and storage after a failed write and permits retry', async () => {
    localStorage.setItem(KEYS.allocations, '{"101":75000}')
    api.updateGoal.mockRejectedValueOnce(new Error('Server unavailable'))
    renderRecovery()
    await openReview()
    selectAllocation()
    fireEvent.click(screen.getByRole('button', { name: 'Save selected changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable')
    expect(screen.getByRole('checkbox', { name: /Recover allocated amount/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /I confirm these are my changes/ })).toBeChecked()
    expect(localStorage.getItem(KEYS.allocations)).toBe('{"101":75000}')
    expect(localStorage.getItem('ledger-sync-goal-recovery:71:101:current_amount')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save selected changes' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Selected goal changes saved.')
    expect(api.updateGoal).toHaveBeenCalledTimes(2)
  })

  it('does not show another account entries or offer recovery in demo or anonymous mode', async () => {
    localStorage.setItem(KEYS.allocations, '{"999":75000}')
    const view = renderRecovery()
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'Review older goal changes' })).not.toBeInTheDocument()
    view.unmount()

    api.getGoals.mockResolvedValue([makeRecoveryGoal({ id: 999 })])
    useDemoStore.getState().enterDemo()
    const demo = renderRecovery()
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: 'Review older goal changes' })).not.toBeInTheDocument()
    demo.unmount()

    useDemoStore.getState().exitDemo()
    useAuthStore.getState().logout()
    renderRecovery()
    expect(screen.queryByRole('button', { name: 'Review older goal changes' })).not.toBeInTheDocument()
    expect(api.updateGoal).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEYS.allocations)).toBe('{"999":75000}')
  })

  it('warns about demo ID collisions and still requires explicit ownership confirmation', async () => {
    api.getGoals.mockResolvedValue([makeRecoveryGoal({ id: 1 })])
    localStorage.setItem(KEYS.allocations, '{"1":75000}')
    renderRecovery()
    await openReview()

    expect(screen.getByText(/The demo also used this goal ID/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Recover allocated amount/ }))
    expect(screen.getByRole('button', { name: 'Save selected changes' })).toBeDisabled()
    expect(api.updateGoal).not.toHaveBeenCalled()
  })

  it('keeps hidden IDs until a separate permanent deletion is confirmed', async () => {
    localStorage.setItem(KEYS.hidden, '[101,999]')
    renderRecovery()
    await openReview()
    expect(screen.getByText(/previously hidden in this browser/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review deletion' })).toBeDisabled()
    confirmOwnership()
    fireEvent.click(screen.getByRole('button', { name: 'Review deletion' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete this goal?' })
    expect(within(dialog).getByText(/permanently removed/)).toBeInTheDocument()
    expect(api.deleteGoal).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep goal' }))
    expect(api.deleteGoal).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEYS.hidden)).toBe('[101,999]')

    fireEvent.click(screen.getByRole('button', { name: 'Review deletion' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete goal' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Goal deleted.')
    expect(api.deleteGoal).toHaveBeenCalledExactlyOnceWith(101)
    expect(localStorage.getItem(KEYS.hidden)).toBe('[101,999]')
    expect(localStorage.getItem('ledger-sync-goal-recovery:71:999:hidden')).toBeNull()
  })

  it('keeps the deletion dialog and legacy input when deletion fails', async () => {
    localStorage.setItem(KEYS.hidden, '[101]')
    api.deleteGoal.mockRejectedValueOnce(new Error('Deletion failed'))
    renderRecovery()
    await openReview()
    confirmOwnership()
    fireEvent.click(screen.getByRole('button', { name: 'Review deletion' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete goal' }))

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deletion failed')
    expect(localStorage.getItem(KEYS.hidden)).toBe('[101]')
    expect(localStorage.getItem('ledger-sync-goal-recovery:71:101:hidden')).toBeNull()
  })

  it('lets the user keep a hidden goal visible without deleting or changing account data', async () => {
    localStorage.setItem(KEYS.hidden, '[101,999]')
    renderRecovery()
    await openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Keep goal visible' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Current goal kept.')
    expect(api.deleteGoal).not.toHaveBeenCalled()
    expect(api.updateGoal).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEYS.hidden)).toBe('[101,999]')
    expect(localStorage.getItem('ledger-sync-goal-recovery:71:101:hidden')).toBe('true')
  })

  it('rejects a stale server review before sending any update', async () => {
    localStorage.setItem(KEYS.allocations, '{"101":75000}')
    api.getGoals.mockResolvedValueOnce([makeRecoveryGoal()])
      .mockResolvedValue([makeRecoveryGoal({ current_amount: 50_000, updated_at: '2026-09-10' })])
    renderRecovery()
    await openReview()
    selectAllocation()
    fireEvent.click(screen.getByRole('button', { name: 'Save selected changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This goal changed')
    expect(api.updateGoal).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEYS.allocations)).toBe('{"101":75000}')
    expect(screen.getByRole('checkbox', { name: /Recover allocated amount/ })).not.toBeChecked()
  })

  it('requires a new review when browser values change before saving', async () => {
    localStorage.setItem(KEYS.allocations, '{"101":75000}')
    renderRecovery()
    await openReview()
    selectAllocation()
    localStorage.setItem(KEYS.allocations, '{"101":85000,"999":90000}')

    fireEvent.click(screen.getByRole('button', { name: 'Save selected changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Browser data changed')
    expect(api.updateGoal).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEYS.allocations)).toBe('{"101":85000,"999":90000}')
    expect(screen.getByRole('checkbox', { name: /Recover allocated amount/ })).not.toBeChecked()
  })

  it('preserves newer local edits and unrelated entries while an approved write is pending', async () => {
    localStorage.setItem(KEYS.allocations, '{"101":75000,"999":90000}')
    const pending = deferred<FinancialGoal>()
    api.updateGoal.mockReturnValueOnce(pending.promise)
    renderRecovery()
    await openReview()
    selectAllocation()
    fireEvent.click(screen.getByRole('button', { name: 'Save selected changes' }))
    await waitFor(() => expect(api.updateGoal).toHaveBeenCalledOnce())
    const newer = '{"101":85000,"999":95000,"777":12000}'
    localStorage.setItem(KEYS.allocations, newer)
    api.getGoals.mockResolvedValue([makeRecoveryGoal({ current_amount: 75_000 })])

    await act(async () => {
      pending.resolve(makeRecoveryGoal({ current_amount: 75_000 }))
      await pending.promise
    })

    expect(await screen.findByRole('status')).toHaveTextContent('Selected goal changes saved.')
    expect(localStorage.getItem(KEYS.allocations)).toBe(newer)
    expect(localStorage.getItem('ledger-sync-goal-recovery:71:101:current_amount')).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Recover allocated amount/ })).not.toBeChecked()
  })

  it('cancels recovery on an account switch during the preflight query', async () => {
    localStorage.setItem(KEYS.allocations, '{"101":75000,"999":90000}')
    const pending = deferred<FinancialGoal[]>()
    api.getGoals.mockResolvedValueOnce([makeRecoveryGoal()]).mockReturnValueOnce(pending.promise)
      .mockResolvedValue([makeRecoveryGoal({ id: 999, name: 'Other account goal' })])
    renderRecovery()
    await openReview()
    selectAllocation()
    fireEvent.click(screen.getByRole('button', { name: 'Save selected changes' }))
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2))

    act(() => signIn(72))
    await act(async () => {
      pending.resolve([makeRecoveryGoal()])
      await pending.promise
    })

    expect(api.updateGoal).not.toHaveBeenCalled()
    expect(localStorage.getItem('ledger-sync-goal-recovery:71:101:current_amount')).toBeNull()
    expect(localStorage.getItem(KEYS.allocations)).toBe('{"101":75000,"999":90000}')
    await openReview()
    expect(screen.getByRole('heading', { name: 'Other account goal' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Emergency fund' })).not.toBeInTheDocument()
  })

  it('does not acknowledge recovery in either account after switching during a write', async () => {
    localStorage.setItem(KEYS.allocations, '{"101":75000,"999":90000}')
    const pending = deferred<FinancialGoal>()
    api.updateGoal.mockReturnValueOnce(pending.promise)
    renderRecovery()
    await openReview()
    selectAllocation()
    fireEvent.click(screen.getByRole('button', { name: 'Save selected changes' }))
    await waitFor(() => expect(api.updateGoal).toHaveBeenCalledOnce())
    api.getGoals.mockResolvedValue([makeRecoveryGoal({ id: 999, name: 'Other account goal' })])

    act(() => signIn(72))
    await act(async () => {
      pending.resolve(makeRecoveryGoal({ current_amount: 75_000 }))
      await pending.promise
    })

    expect(localStorage.getItem('ledger-sync-goal-recovery:71:101:current_amount')).toBeNull()
    expect(localStorage.getItem('ledger-sync-goal-recovery:72:101:current_amount')).toBeNull()
    expect(localStorage.getItem(KEYS.allocations)).toBe('{"101":75000,"999":90000}')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
