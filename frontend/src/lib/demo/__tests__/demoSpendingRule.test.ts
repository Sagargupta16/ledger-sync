import { describe, expect, it } from 'vitest'

import { generateDemoSpendingRule } from '../demoComputedReads'
import { generateDemoTransactions } from '../generateTransactions'

/**
 * The 50/30/20 mock has to reproduce the definition
 * `/api/analytics/v2/spending-rule` is built around, not the intuitive one.
 *
 * Savings is the NET CHANGE IN THE INVESTMENT PERIMETER -- allocations into
 * SIP/PPF/EPF/NPS/stocks minus redemptions out of them (`_compute_buckets` in
 * `backend/src/ledger_sync/api/analytics_v2_impl/spending_rule.py`). It is NOT
 * `income - expenses`. The mock used to compute it that way, which has two
 * consequences that this file pins:
 *
 * 1. It reports money that merely stayed in a bank account as invested --
 *    an intention reported as an outcome.
 * 2. It forces `unallocated` to be identically zero by construction, so demo
 *    mode could never surface an Unallocated figure at all, and the /budgets
 *    residual row could never be exercised.
 *
 * Income is the single denominator for all four buckets, which is what makes the
 * four shares sum to exactly 100 (`_pct_of_income`).
 */
const rows = generateDemoTransactions()
const result = generateDemoSpendingRule(rows, {})

/** Floating-point sums of thousands of rupee amounts: compare to the paisa. */
const PAISA = 0.01

describe('generateDemoSpendingRule reconciliation', () => {
  it('produces a non-trivial ledger to reconcile', () => {
    // Guards every assertion below from passing vacuously on an empty window.
    expect(rows.length).toBeGreaterThan(0)
    expect(result.income_total).toBeGreaterThan(0)
    expect(result.expense_total).toBeGreaterThan(0)
    expect(result.categories.length).toBeGreaterThan(0)
  })

  it('adds the three buckets plus unallocated to income exactly', () => {
    // The identity the endpoint publishes `unallocated_amount` to guarantee.
    const { needs, wants, savings } = result.buckets
    const sum = needs.amount + wants.amount + savings.amount + result.unallocated_amount
    expect(sum).toBeCloseTo(result.income_total, 2)
    expect(Math.abs(sum - result.income_total)).toBeLessThan(PAISA)
  })

  it('adds the four shares to 100 percent', () => {
    const { needs, wants, savings } = result.buckets
    const total =
      needs.pct_of_income +
      wants.pct_of_income +
      savings.pct_of_income +
      result.unallocated_pct_of_income
    expect(total).toBeCloseTo(100, 6)
  })

  it('does not define savings as income minus expenses', () => {
    // The exact regression. If savings ever equals the flow residual again,
    // `unallocated` collapses to zero and the perimeter definition is gone.
    const flowResidual = result.income_total - result.expense_total
    expect(result.buckets.savings.amount).not.toBeCloseTo(flowResidual, 2)
    expect(result.savings_amount).toBe(result.buckets.savings.amount)
  })

  it('reports a non-zero unallocated residual', () => {
    // Demo mode must be able to render the /budgets Unallocated row. A zero here
    // is the signature of savings having been computed as income minus expenses.
    expect(Math.abs(result.unallocated_amount)).toBeGreaterThan(PAISA)
  })

  it('splits every expense rupee between needs and wants', () => {
    // The two spend buckets are a partition of expenses: a category that fell
    // through both would silently shrink the spend side and inflate the residual.
    const spend = result.buckets.needs.amount + result.buckets.wants.amount
    expect(spend).toBeCloseTo(result.expense_total, 2)
  })

  it('agrees with the categories table on each bucket total', () => {
    // The header cards and the table below them are the same numbers by
    // construction; this pins that they stay that way.
    for (const bucket of ['needs', 'wants'] as const) {
      const fromTable = result.categories
        .filter((row) => row.bucket === bucket)
        .reduce((sum, row) => sum + row.total_amount, 0)
      expect(fromTable).toBeCloseTo(result.buckets[bucket].amount, 2)
    }
  })

  it('reports zero shares rather than dividing by a zero income', () => {
    // `_pct_of_income` returns 0.0 when income <= 0. A date window with no
    // income must reproduce that instead of emitting Infinity or NaN.
    const empty = generateDemoSpendingRule(rows, {
      start_date: '1990-01-01',
      end_date: '1990-01-31',
    })

    expect(empty.income_total).toBe(0)
    for (const share of [
      empty.buckets.needs.pct_of_income,
      empty.buckets.wants.pct_of_income,
      empty.buckets.savings.pct_of_income,
      empty.unallocated_pct_of_income,
    ]) {
      expect(Number.isFinite(share)).toBe(true)
      expect(share).toBe(0)
    }
  })
})
