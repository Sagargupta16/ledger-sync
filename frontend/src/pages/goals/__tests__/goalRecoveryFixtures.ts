import type { FinancialGoal } from '@/services/api/analyticsV2'

export function makeRecoveryGoal(overrides: Partial<FinancialGoal> = {}): FinancialGoal {
  return {
    id: 101,
    name: 'Emergency fund',
    goal_type: 'savings',
    target_amount: 100_000,
    current_amount: 0,
    progress_pct: 0,
    start_date: '2026-01-01',
    target_date: '2027-01-01T00:00:00',
    is_achieved: false,
    achieved_date: null,
    notes: 'Keep this account note',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-09-09T00:00:00',
    ...overrides,
  }
}
