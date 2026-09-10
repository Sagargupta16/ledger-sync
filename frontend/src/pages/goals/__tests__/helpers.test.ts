import { describe, expect, it } from 'vitest'

import { rawColors } from '@/constants/colors'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { computeGoalPace, computeGoalProjection as computeDomainProjection } from '@/lib/finance/goalProjection'

import { addMonths, computeGoalProjection, differenceInMonths } from '../helpers'
import type { GoalDeadlineState } from '../types'

/**
 * These guard the whole-month contract of `differenceInMonths`. The bug class
 * they replace: the old version added `(later.getDate() - earlier.getDate()) /
 * 30`, so a deadline one day out measured 0.033 months and
 * `amountRemaining / monthsRemaining` reported ~30x the real contribution.
 *
 * Every case injects "now" explicitly -- nothing here reads the real clock.
 */

const TARGET_AMOUNT = 120_000

function makeGoal(overrides: Partial<FinancialGoal> = {}): FinancialGoal {
  return {
    id: 1,
    name: 'Test goal',
    goal_type: 'savings',
    target_amount: TARGET_AMOUNT,
    current_amount: 0,
    progress_pct: 0,
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

describe('differenceInMonths', () => {
  it('counts a whole month as 1 and does not inflate on a partial month', () => {
    expect(differenceInMonths(new Date(2026, 7, 15), new Date(2026, 6, 15))).toBe(1)
    // 15 Jul -> 14 Aug is 30 days but not a full calendar month yet.
    expect(differenceInMonths(new Date(2026, 7, 14), new Date(2026, 6, 15))).toBe(0)
  })

  it('returns 0 for sub-month distances instead of a day fraction', () => {
    // The fractional version returned 1/30 and 3/30 here.
    expect(differenceInMonths(new Date(2026, 6, 28), new Date(2026, 6, 27))).toBe(0)
    expect(differenceInMonths(new Date(2026, 6, 30), new Date(2026, 6, 27))).toBe(0)
    expect(differenceInMonths(new Date(2026, 7, 5), new Date(2026, 6, 27))).toBe(0)
  })

  it('counts long spans by calendar month', () => {
    expect(differenceInMonths(new Date(2028, 0, 15), new Date(2026, 6, 15))).toBe(18)
    expect(differenceInMonths(new Date(2027, 6, 15), new Date(2026, 6, 15))).toBe(12)
  })

  it('clamps a month-end anchor instead of overflowing', () => {
    // 31 Jan -> 28 Feb is one calendar month; day-of-month comparison alone
    // would call it 0 because 28 < 31.
    expect(differenceInMonths(new Date(2026, 1, 28), new Date(2026, 0, 31))).toBe(1)
    expect(differenceInMonths(new Date(2024, 1, 29), new Date(2024, 0, 31))).toBe(1)
    // One day short of the clamped month-end still is not a month.
    expect(differenceInMonths(new Date(2026, 1, 27), new Date(2026, 0, 31))).toBe(0)
  })

  it('is negative when the later date precedes the earlier one', () => {
    expect(differenceInMonths(new Date(2026, 4, 15), new Date(2026, 6, 15))).toBe(-2)
    expect(differenceInMonths(new Date(2026, 6, 10), new Date(2026, 6, 15))).toBe(0)
  })
})

describe('shared goal projection', () => {
  it.each([null, 0, -5_000])('keeps the required contribution without projecting %s monthly savings', (savings) => {
    const projection = computeDomainProjection(
      { target_amount: TARGET_AMOUNT, target_date: '2026-08-15' },
      30_000,
      savings,
      new Date(2026, 6, 15),
    )

    expect(projection).toEqual({
      monthsRemaining: 1,
      deadlineState: 'scheduled',
      requiredMonthlySavings: 90_000,
      projectedDate: null,
      monthsToComplete: null,
      status: 'no_data',
      monthsDelta: null,
    })
  })

  it('treats a zero target as achieved without savings data', () => {
    const projection = computeDomainProjection(
      { target_amount: 0, target_date: null },
      0,
      null,
      new Date(2026, 0, 31),
    )

    expect(projection).toEqual({
      monthsRemaining: 0,
      deadlineState: 'none',
      requiredMonthlySavings: null,
      projectedDate: null,
      monthsToComplete: null,
      status: 'achieved',
      monthsDelta: null,
    })
  })

  it('projects fractional months after clamping the whole month to its last day', () => {
    const projection = computeDomainProjection(
      { target_amount: TARGET_AMOUNT, target_date: '2026-02-28' },
      30_000,
      60_000,
      new Date(2026, 0, 31),
    )

    expect(projection).toEqual({
      monthsRemaining: 1,
      deadlineState: 'scheduled',
      requiredMonthlySavings: 90_000,
      projectedDate: new Date(2026, 2, 15),
      monthsToComplete: 1.5,
      status: 'slightly_behind',
      monthsDelta: 0,
    })
  })

  it('keeps an open-ended projection on track with its signed month delta', () => {
    const projection = computeDomainProjection(
      { target_amount: TARGET_AMOUNT, target_date: null },
      0,
      60_000,
      new Date(2026, 0, 31),
    )

    expect(projection).toEqual({
      monthsRemaining: 0,
      deadlineState: 'none',
      requiredMonthlySavings: null,
      projectedDate: new Date(2026, 2, 31),
      monthsToComplete: 2,
      status: 'on_track',
      monthsDelta: -2,
    })
  })
})

describe('goal projection presentation', () => {
  it('reads refreshed theme colors when computing a projection', () => {
    const originalGreen = rawColors.app.green
    try {
      rawColors.app.green = '#123456'
      const projection = computeGoalProjection(makeGoal(), TARGET_AMOUNT, null, new Date(2026, 0, 31))
      expect(projection.statusColor).toBe('#123456')
    } finally {
      rawColors.app.green = originalGreen
    }
  })

  it.each([
    [TARGET_AMOUNT, null, 'achieved', 'Achieved', rawColors.app.green, null],
    [0, 0, 'no_data', 'No savings data', rawColors.app.yellow, null],
    [0, 240_000, 'on_track', 'On Track', rawColors.app.green, 1],
    [0, 120_000, 'on_track', 'On Track', rawColors.app.green, 0],
    [0, 30_000, 'slightly_behind', 'Slightly Behind', rawColors.app.yellow, -3],
    [0, 24_000, 'behind', 'Behind', rawColors.app.red, -4],
  ] as const)('preserves status and presentation with %s saved and %s monthly', (
    currentAmount, savings, status, statusLabel, statusColor, monthsDelta,
  ) => {
    const projection = computeGoalProjection(
      makeGoal({ target_date: '2026-02-28' }),
      currentAmount,
      savings,
      new Date(2026, 0, 31),
    )

    expect(projection).toMatchObject({ status, statusLabel, statusColor, monthsDelta })
  })
})

describe('goal funding pace', () => {
  it.each([
    ['missing start', null, '2027-01-01', 6, 'on_track', undefined],
    ['missing deadline', '2026-01-01', null, 0, 'on_track', undefined],
    ['achieved', '2026-01-01', '2027-01-01', 6, 'achieved', undefined],
    ['sub-month timeline', '2026-01-01', '2026-01-20', 0, 'on_track', undefined],
    ['reversed timeline', '2027-01-01', '2026-01-01', 0, 'on_track', undefined],
    ['invalid timeline', 'invalid', '2027-01-01', 6, 'on_track', undefined],
    ['before the start', '2026-01-01', '2027-01-01', 18, 'on_track', 0],
    ['halfway', '2026-01-01', '2027-01-01', 6, 'on_track', 50],
    ['after the deadline', '2026-01-01', '2027-01-01', -1, 'on_track', 100],
    ['clamped month end', '2026-01-31', '2026-02-28', 0, 'on_track', 100],
  ] as const)('preserves the pace for %s', (
    _label, startDate, targetDate, monthsRemaining, status, expected,
  ) => {
    expect(computeGoalPace(
      { start_date: startDate, target_date: targetDate },
      { monthsRemaining, status },
    )).toBe(expected)
  })
})

describe('addMonths', () => {
  it('steps whole months on the real calendar', () => {
    expect(addMonths(new Date(2026, 6, 15), 1)).toEqual(new Date(2026, 7, 15))
    expect(addMonths(new Date(2026, 6, 15), 18)).toEqual(new Date(2028, 0, 15))
  })

  it('clamps a month-end anchor rather than overflowing into the next month', () => {
    // `setMonth(getMonth() + 1)` on 31 Jan lands on 3 March.
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28))
    expect(addMonths(new Date(2024, 0, 31), 1)).toEqual(new Date(2024, 1, 29))
  })

  it('spreads a fractional month over average days', () => {
    // 0.5 month from 1 Jul = ~15 days.
    expect(addMonths(new Date(2026, 6, 1), 0.5)).toEqual(new Date(2026, 6, 16))
  })
})

describe('computeGoalProjection -- required monthly savings near the deadline', () => {
  /**
   * Sub-month and already-missed deadlines share one contract: no whole month
   * remains, so no per-month figure is quoted at all. The fractional version
   * divided by 1/30 and 3/30 on the two near cases and quoted up to 30x the
   * target amount, and a missed deadline has no remaining months to spread over,
   * so its negative span is floored at 0.
   */
  it.each<[string, string, GoalDeadlineState]>([
    ['1 day out', '2026-07-28', 'due_soon'],
    ['3 days out', '2026-07-30', 'due_soon'],
    ['already past', '2026-05-01', 'past_due'],
  ])('quotes no required amount when the target is %s', (_label, targetDate, deadlineState) => {
    const now = new Date(2026, 6, 27)
    const projection = computeGoalProjection(makeGoal({ target_date: targetDate }), 0, null, now)
    expect(projection.monthsRemaining).toBe(0)
    expect(projection.deadlineState).toBe(deadlineState)
    expect(projection.requiredMonthlySavings).toBeNull()
  })

  it('reports 1 month and the full remainder when the target is exactly 1 month out', () => {
    const now = new Date(2026, 6, 15)
    const projection = computeGoalProjection(makeGoal({ target_date: '2026-08-15' }), 0, null, now)
    expect(projection.monthsRemaining).toBe(1)
    expect(projection.deadlineState).toBe('scheduled')
    expect(projection.requiredMonthlySavings).toBe(TARGET_AMOUNT)
  })

  it('reports 18 months and spreads the remainder across them', () => {
    const now = new Date(2026, 6, 15)
    const projection = computeGoalProjection(makeGoal({ target_date: '2028-01-15' }), 0, null, now)
    expect(projection.monthsRemaining).toBe(18)
    expect(projection.deadlineState).toBe('scheduled')
    expect(projection.requiredMonthlySavings).toBe(TARGET_AMOUNT / 18)
  })

  it('counts a month-end anchor without overflowing (31 Jan to 28 Feb)', () => {
    const now = new Date(2026, 0, 31)
    const projection = computeGoalProjection(makeGoal({ target_date: '2026-02-28' }), 0, null, now)
    expect(projection.monthsRemaining).toBe(1)
    expect(projection.deadlineState).toBe('scheduled')
    expect(projection.requiredMonthlySavings).toBe(TARGET_AMOUNT)
  })

  it('leaves an open-ended goal with no deadline pressure', () => {
    const now = new Date(2026, 6, 27)
    const projection = computeGoalProjection(makeGoal({ target_date: null }), 0, null, now)
    expect(projection.monthsRemaining).toBe(0)
    expect(projection.deadlineState).toBe('none')
    expect(projection.requiredMonthlySavings).toBeNull()
  })

  it('keeps the achieved branch intact when the goal is already funded', () => {
    const now = new Date(2026, 6, 27)
    const projection = computeGoalProjection(
      makeGoal({ target_date: '2026-07-28' }),
      TARGET_AMOUNT,
      5_000,
      now,
    )
    expect(projection.status).toBe('achieved')
    expect(projection.deadlineState).toBe('due_soon')
    expect(projection.requiredMonthlySavings).toBeNull()
  })
})
