import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'

import GoalCard from '../components/GoalCard'
import type { GoalProjection } from '../types'

/**
 * `start_date` is nullable on the wire. `financial_goals.created_at` was created
 * `nullable=True` in `20260203_1700_add_analytics_tables.py` and never altered
 * (only `transactions.created_at` was), and the goals serializer derives both
 * `start_date` and `created_at` from that one column -- so a row written before
 * the model-level default arrives as `null`.
 *
 * The type declared it `string`, so the on-pace tick handed it straight to
 * `parseLocalDate`, which called `.slice` on `null` and threw. React unmounts on
 * a render throw, so one old goal row took out the whole card, not just its tick.
 */

const PROJECTION: GoalProjection = {
  monthsRemaining: 6,
  deadlineState: 'scheduled',
  requiredMonthlySavings: 20_000,
  projectedDate: new Date(2027, 0, 1),
  monthsToComplete: 6,
  status: 'on_track',
  statusLabel: 'On track',
  statusColor: '#22c55e',
  monthsDelta: 0,
}

function makeGoal(overrides: Partial<FinancialGoal> = {}): FinancialGoal {
  return {
    id: 1,
    name: 'Emergency fund',
    goal_type: 'savings',
    target_amount: 120_000,
    current_amount: 60_000,
    progress_pct: 50,
    start_date: '2026-01-01',
    target_date: '2027-01-01',
    is_achieved: false,
    achieved_date: null,
    notes: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: null,
    ...overrides,
  }
}

function renderCard(goal: FinancialGoal) {
  return render(
    <GoalCard
      goal={goal}
      effectiveAmount={60_000}
      projection={PROJECTION}
      avgMonthlySavings={15_000}
      isEditing={false}
      isEditingDetails={false}
      onStartEdit={vi.fn()}
      onStartEditDetails={vi.fn()}
      onSaveAllocation={vi.fn()}
      onSaveDetails={vi.fn()}
      onCancelEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
}

describe('GoalCard with a null start_date', () => {
  it('still renders the goal instead of throwing out of the render', () => {
    expect(() => renderCard(makeGoal({ start_date: null }))).not.toThrow()
    expect(screen.getByText('Emergency fund')).toBeInTheDocument()
  })

  it('renders normally when start_date is present', () => {
    renderCard(makeGoal())
    expect(screen.getByText('Emergency fund')).toBeInTheDocument()
  })
})
