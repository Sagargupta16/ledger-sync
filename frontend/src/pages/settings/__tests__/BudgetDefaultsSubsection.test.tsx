import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { generateDemoPreferences } from '@/lib/demo/demoPreferences'
import { useDemoStore } from '@/store/demoStore'
import { useMotionStore } from '@/store/motionStore'
import BudgetDefaultsSubsection from '../sections/BudgetDefaultsSubsection'

const mocks = vi.hoisted(() => ({
  categories: vi.fn(),
  budgets: vi.fn(),
  createBudget: vi.fn(),
  mutate: vi.fn(),
  refetchCategories: vi.fn(),
  refetchBudgets: vi.fn(),
}))

vi.mock('@/hooks/api/useAnalytics', () => ({
  useCategoryBreakdown: mocks.categories,
}))
vi.mock('@/hooks/api/useAnalyticsV2', () => ({
  useBudgets: mocks.budgets,
  useCreateBudget: mocks.createBudget,
}))

function renderDefaults(defaultThreshold = 72.5) {
  const preferences = {
    ...generateDemoPreferences(),
    default_budget_alert_threshold: defaultThreshold,
    auto_create_budgets: true,
    budget_rollover_enabled: true,
  }
  const update = vi.fn()
  render(<BudgetDefaultsSubsection localPrefs={preferences} updateLocalPref={update} />)
  return { preferences, update }
}

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Set up a budget' }))
  return screen.getByRole('form', { name: 'Create a monthly budget' })
}

function fillBudget() {
  fireEvent.change(screen.getByRole('combobox', { name: 'Expense category' }), {
    target: { value: 'Food' },
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Monthly budget limit (INR)' }), {
    target: { value: '2500.50' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useDemoStore.setState({ isDemoMode: false })
  useMotionStore.getState().setMode('reduced')
  mocks.categories.mockReturnValue({
    data: { categories: { Food: { total: 100 }, Rent: { total: 1000 } } },
    isPending: false,
    isError: false,
    refetch: mocks.refetchCategories,
  })
  mocks.budgets.mockReturnValue({
    data: [{ category: 'Rent', subcategory: null }],
    isPending: false,
    isError: false,
    refetch: mocks.refetchBudgets,
  })
  mocks.createBudget.mockReturnValue({ mutate: mocks.mutate, isPending: false })
})

afterEach(() => {
  cleanup()
  useDemoStore.setState({ isDemoMode: false })
  useMotionStore.getState().setMode('full')
})

describe('Budget defaults and explicit setup', () => {
  it('does not create budgets or change stored automatic and rollover flags on mount', () => {
    const { preferences, update } = renderDefaults()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByText('Automatic creation and rollover are not part of this setup.')).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(preferences.auto_create_budgets).toBe(true)
    expect(preferences.budget_rollover_enabled).toBe(true)
  })

  it('copies the selected default into setup without creating anything', () => {
    renderDefaults()
    openForm()
    expect(screen.getByRole('spinbutton', { name: 'Alert threshold (%)' })).toHaveValue(72.5)
    expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Rent' })).not.toBeInTheDocument()
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('submits the reviewed category, monthly limit, and default threshold only on explicit submit', () => {
    const { update } = renderDefaults()
    const form = openForm()
    fillBudget()
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.submit(form)
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith({
      category: 'Food',
      monthly_limit: 2500.5,
      alert_threshold: 72.5,
    }, expect.any(Object))
    expect(update).not.toHaveBeenCalled()
  })

  it.each([0, 100])('uses an explicit %s percent override without replacing it with a default', (threshold) => {
    renderDefaults()
    const form = openForm()
    fillBudget()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Alert threshold (%)' }), {
      target: { value: String(threshold) },
    })
    fireEvent.submit(form)
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ alert_threshold: threshold }),
      expect.any(Object),
    )
  })

  it('rejects missing details, nonpositive limits, and thresholds outside zero to one hundred', () => {
    renderDefaults()
    const form = openForm()
    fireEvent.submit(form)
    fillBudget()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Monthly budget limit (INR)' }), {
      target: { value: '0' },
    })
    fireEvent.submit(form)
    fillBudget()
    for (const value of ['-1', '101', '']) {
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Alert threshold (%)' }), {
        target: { value },
      })
      fireEvent.submit(form)
    }
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('keeps demo setup read-only even when a submit event is dispatched', () => {
    useDemoStore.setState({ isDemoMode: true })
    renderDefaults()
    const form = openForm()
    fillBudget()
    expect(screen.getByRole('button', { name: 'Create budget' })).toBeDisabled()
    fireEvent.submit(form)
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/Demo mode is read-only/)).toBeInTheDocument()
  })

  it('reports load errors and offers a retry without allowing creation', () => {
    mocks.categories.mockReturnValue({
      isPending: false, isError: true, refetch: mocks.refetchCategories,
    })
    renderDefaults()
    const form = openForm()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load categories and existing budgets.')
    expect(screen.getByRole('button', { name: 'Create budget' })).toBeDisabled()
    fireEvent.submit(form)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetchCategories).toHaveBeenCalledOnce()
    expect(mocks.refetchBudgets).toHaveBeenCalledOnce()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('announces an explicit successful save and closes setup', () => {
    mocks.mutate.mockImplementationOnce((_data, options: { onSuccess: () => void }) => {
      options.onSuccess()
    })
    renderDefaults()
    const form = openForm()
    fillBudget()
    fireEvent.submit(form)
    expect(screen.getByRole('status')).toHaveTextContent('Monthly budget created for Food.')
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('keeps entered values and displays a failed save without claiming success', () => {
    mocks.mutate.mockImplementationOnce((_data, options: { onError: (error: Error) => void }) => {
      options.onError(new Error('Budget already exists'))
    })
    renderDefaults()
    const form = openForm()
    fillBudget()
    fireEvent.submit(form)
    expect(screen.getByRole('alert')).toHaveTextContent('Budget already exists')
    expect(screen.getByRole('spinbutton', { name: 'Monthly budget limit (INR)' })).toHaveValue(2500.5)
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
