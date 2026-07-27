import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  completeMonthKeys,
  currentMonthKey,
  investmentAllocationRatePercent,
  isCompleteMonth,
  netSavings,
  type PeriodFlows,
  pooledSavingsRatePercent,
  savingsRatePercent,
  savingsRatePercentFromNet,
  savingsRatePercentOr,
  shareOfIncomePercent,
  sumFlows,
} from '@/lib/savingsRate'
import { isPartialMonth } from '@/lib/dateUtils'

import {
  cfpInputsFromAnalysis,
  computeAnalysis,
  computeMonthlyData,
} from '@/components/analytics/health/healthScoreAnalysis'
import {
  generateDemoKPIs,
  generateDemoMonthlyAggregation,
  generateDemoTotals,
} from '@/lib/demo/demoCalculations'
import { computeCFPScore } from '@/lib/financialHealthCalculator'
import type { Transaction } from '@/types'

afterEach(() => {
  vi.useRealTimers()
})

describe('savingsRatePercent', () => {
  it('is (income - expense) / income as a percentage', () => {
    expect(savingsRatePercent({ income: 100000, expense: 60000 })).toBeCloseTo(40, 10)
  })

  it('returns null for zero income instead of a fake 0%', () => {
    expect(savingsRatePercent({ income: 0, expense: 5000 })).toBeNull()
    expect(savingsRatePercent({ income: 0, expense: 0 })).toBeNull()
  })

  it('returns null for negative income (a refunded/reversed month)', () => {
    expect(savingsRatePercent({ income: -100, expense: 50 })).toBeNull()
  })

  it('reports a negative rate when spending exceeds income, without clamping', () => {
    // The real ledger's in-progress month: 13,511.11 in, 107,651.65 out.
    expect(savingsRatePercent({ income: 13511.11, expense: 107651.65 })).toBeCloseTo(-696.77, 1)
  })

  it('netSavings is the numerator and can be negative', () => {
    expect(netSavings({ income: 13511.11, expense: 107651.65 })).toBeCloseTo(-94140.54, 2)
  })

  it('savingsRatePercentOr substitutes an explicit fallback only when income is absent', () => {
    expect(savingsRatePercentOr({ income: 0, expense: 900 })).toBe(0)
    expect(savingsRatePercentOr({ income: 0, expense: 900 }, -1)).toBe(-1)
    expect(savingsRatePercentOr({ income: 200, expense: 50 })).toBeCloseTo(75, 10)
  })
})

describe('pooledSavingsRatePercent', () => {
  it('pools numerators and denominators rather than averaging per-period rates', () => {
    // A tiny stipend month plus a salary month. Averaging the two rates gives
    // (-300 + 60) / 2 = -120%; pooling gives the true +58.6%.
    const periods = [
      { income: 1000, expense: 4000 },
      { income: 250000, expense: 100000 },
    ]
    expect(pooledSavingsRatePercent(periods)).toBeCloseTo(58.57, 2)
  })

  it('returns null when no period had income', () => {
    expect(pooledSavingsRatePercent([{ income: 0, expense: 400 }])).toBeNull()
    expect(pooledSavingsRatePercent([])).toBeNull()
  })
})

describe('completeMonthKeys', () => {
  it('drops the in-progress month regardless of the day of the month', () => {
    // The old rule kept the current month from the 15th onward, so the same
    // ledger reported two different savings rates depending on the calendar day.
    const keys = ['2026-05', '2026-06', '2026-07']
    expect(completeMonthKeys(keys, new Date(2026, 6, 3))).toEqual(['2026-05', '2026-06'])
    expect(completeMonthKeys(keys, new Date(2026, 6, 27))).toEqual(['2026-05', '2026-06'])
  })

  it('drops future months too, and does not rely on sort position', () => {
    // A future-dated payroll row (the real ledger has 2026-07-31) means the
    // current month is not the last key, which broke the old `pop()`/`at(-1)`.
    const keys = ['2026-05', '2026-06', '2026-07', '2026-08']
    expect(completeMonthKeys(keys, new Date(2026, 6, 27))).toEqual(['2026-05', '2026-06'])
  })

  it('currentMonthKey and isCompleteMonth use local time', () => {
    expect(currentMonthKey(new Date(2026, 6, 27))).toBe('2026-07')
    expect(isCompleteMonth('2026-06', new Date(2026, 6, 27))).toBe(true)
    expect(isCompleteMonth('2026-07', new Date(2026, 6, 27))).toBe(false)
  })

  /**
   * There is ONE month-completeness rule in this app and it lives in
   * `dateUtils.getMonthProgress`. A bare `key < currentMonthKey(now)` is a
   * SECOND rule that disagrees on the last calendar day of every month: on the
   * 31st every day of July exists, so dateUtils calls July complete while the
   * naive comparison still calls it in progress. Four non-test modules consume
   * the dateUtils rule (useAnalyticsTimeFilter, useIncomeAnalysis, useNetWorth,
   * useTrendsForecasts), so the disagreement showed up as the health panel
   * silently dropping a whole finished month that every trend kept.
   */
  it('agrees with dateUtils on the last calendar day of the month', () => {
    const jul31 = new Date(2026, 6, 31, 12, 0, 0)
    expect(isPartialMonth('2026-07', jul31)).toBe(false)
    expect(isCompleteMonth('2026-07', jul31)).toBe(true)
    expect(completeMonthKeys(['2026-06', '2026-07'], jul31)).toEqual(['2026-06', '2026-07'])
  })

  it('still calls the month in progress incomplete on the second-to-last day', () => {
    const jul30 = new Date(2026, 6, 30, 12, 0, 0)
    expect(isPartialMonth('2026-07', jul30)).toBe(true)
    expect(isCompleteMonth('2026-07', jul30)).toBe(false)
    expect(completeMonthKeys(['2026-06', '2026-07'], jul30)).toEqual(['2026-06'])
  })

  it('never calls a FUTURE month complete, which dateUtils alone would', () => {
    // `isPartialMonth` says false for a future month (nothing is in progress),
    // so delegating to it blindly would have admitted future-dated rows.
    const jul31 = new Date(2026, 6, 31, 12, 0, 0)
    expect(isPartialMonth('2026-09', jul31)).toBe(false)
    expect(isCompleteMonth('2026-09', jul31)).toBe(false)
    expect(completeMonthKeys(['2026-06', '2026-07', '2026-09'], jul31)).toEqual([
      '2026-06',
      '2026-07',
    ])
  })

  it('matches the dateUtils rule for every day of a 31-day month', () => {
    // Exhaustive rather than spot-checked: the two rules must be the same
    // function of (monthKey, now), not merely agree on the days we remembered.
    for (let day = 1; day <= 31; day++) {
      const now = new Date(2026, 6, day, 12, 0, 0)
      expect({ day, complete: isCompleteMonth('2026-07', now) }).toEqual({
        day,
        complete: !isPartialMonth('2026-07', now),
      })
    }
  })

  it('matches the dateUtils rule on a 28-day February and a leap February', () => {
    for (const [label, year, lastDay] of [
      ['2026-02', 2026, 28],
      ['2028-02', 2028, 29],
    ] as const) {
      const lastDayNow = new Date(year, 1, lastDay, 12, 0, 0)
      expect({ label, complete: isCompleteMonth(label, lastDayNow) }).toEqual({
        label,
        complete: true,
      })
      const dayBefore = new Date(year, 1, lastDay - 1, 12, 0, 0)
      expect({ label, complete: isCompleteMonth(label, dayBefore) }).toEqual({
        label,
        complete: false,
      })
    }
  })
})

// ─── Health engine wiring ────────────────────────────────────────────────────

/** Steady salaried months, oldest first. `computeMonthlyData` needs >= 10 rows. */
function ledger(months: string[], income: number, expense: number): Transaction[] {
  return months.flatMap((month) => [
    { id: `i${month}`, date: `${month}-05`, amount: income, type: 'Income', category: 'Salary', account: 'Bank SBI' },
    { id: `e${month}`, date: `${month}-06`, amount: expense, type: 'Expense', category: 'Rent', account: 'Bank SBI' },
  ])
}

/** Six complete months ending 2026-06, relative to a 2026-07-27 "today". */
const COMPLETE_MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']

describe('health engine savings rate', () => {
  const noInvestment = () => false

  it('excludes the partial current month from the multi-month rate', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    // Six complete months at a 40% rate, plus a partial month that is all outflow.
    const txns = [
      ...ledger(COMPLETE_MONTHS, 100000, 60000),
      {
        id: 'partial', date: '2026-07-02', amount: 90000, type: 'Expense',
        category: 'Rent', account: 'Bank SBI',
      } as Transaction,
    ]
    const built = computeMonthlyData(txns, noInvestment)
    expect(built).not.toBeNull()
    expect(built!.months).toEqual(COMPLETE_MONTHS)
    expect(built!.monthlyData['2026-07']).toBeUndefined()

    const analysis = computeAnalysis(built!.months, built!.monthlyData)
    expect(analysis.monthsAnalyzed).toBe(6)
    expect(analysis.savingsRate).toBeCloseTo(40, 10)
  })

  it('still excludes the in-progress month late in the month (was kept from the 15th)', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const txns = ledger([...COMPLETE_MONTHS, '2026-07'], 100000, 60000)
    const built = computeMonthlyData(txns, noInvestment)
    expect(built!.months).not.toContain('2026-07')
  })

  it('drops a future-dated month instead of the current one', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const txns = [
      ...ledger(COMPLETE_MONTHS, 100000, 60000),
      { id: 'fut', date: '2026-08-31', amount: 3600, type: 'Income', category: 'Salary', account: 'Bank SBI' } as Transaction,
    ]
    const built = computeMonthlyData(txns, noInvestment)
    expect(built!.months).toEqual(COMPLETE_MONTHS)
    expect(built!.monthlyData['2026-08']).toBeUndefined()
  })

  it('reports a negative rate for a net-negative period', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const txns = ledger(COMPLETE_MONTHS, 50000, 75000)
    const built = computeMonthlyData(txns, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)
    expect(analysis.savingsRate).toBeCloseTo(-50, 10)
  })

  it('reports 0 rather than a divide-by-zero when the period has no income', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const txns = COMPLETE_MONTHS.flatMap((month, i) =>
      Array.from({ length: 3 }, (_, k) => ({
        id: `e${i}-${k}`, date: `${month}-0${k + 1}`, amount: 8000, type: 'Expense',
        category: 'Rent', account: 'Bank SBI',
      })),
    ) as Transaction[]
    const built = computeMonthlyData(txns, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)
    expect(analysis.savingsRate).toBe(0)
    expect(Number.isFinite(analysis.savingsRate)).toBe(true)
  })

  it('counts a transfer into an investment account as savings, not spending', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const withSip = [
      ...ledger(COMPLETE_MONTHS, 100000, 60000),
      ...COMPLETE_MONTHS.map((month, i) => ({
        id: `sip${i}`, date: `${month}-10`, amount: 25000, type: 'Transfer',
        category: 'Investment', account: 'Bank SBI', from_account: 'Bank SBI',
        to_account: 'Zerodha Demat', note: 'SIP',
      })),
    ] as Transaction[]

    const built = computeMonthlyData(withSip, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)
    // The SIP must not inflate expenses: rate stays 40%, and it lands in the
    // investment bucket so the investment-to-income ratio sees it.
    expect(analysis.savingsRate).toBeCloseTo(40, 10)
    expect(analysis.avgMonthlyExpense).toBeCloseTo(60000, 10)
    expect(analysis.totalInvestmentInflow).toBeCloseTo(25000 * COMPLETE_MONTHS.length, 10)
    expect(analysis.investmentToIncomeRatio).toBeCloseTo(25, 10)
  })

  it('needs 3 FINISHED months, so a 3-month-old account loses its score', () => {
    // Documented tradeoff, not an accident. The minimum counts finished months,
    // so an account whose entire history is the in-progress month plus the two
    // before it drops below the floor and the panel renders its empty state --
    // where before the 15th-of-the-month rule it would have shown a score built
    // on a part-month. One more finished month restores it.
    vi.setSystemTime(new Date(2026, 6, 20))
    // Four rows per month, so the >= 10-row gate is never what returns null here
    // -- the month floor is.
    const dense = (months: string[]) =>
      months.flatMap((month) =>
        [0, 1].flatMap((k) => ledger([month], 50000, 30000).map((tx, i) => ({
          ...tx,
          id: `${tx.id}-${k}-${i}`,
          date: `${month}-${String(10 + k * 2 + i).padStart(2, '0')}`,
        }))),
      )

    expect(dense(['2026-05', '2026-06', '2026-07'])).toHaveLength(12)
    expect(computeMonthlyData(dense(['2026-05', '2026-06', '2026-07']), noInvestment)).toBeNull()

    const built = computeMonthlyData(
      dense(['2026-04', '2026-05', '2026-06', '2026-07']),
      noInvestment,
    )
    expect(built?.months).toEqual(['2026-04', '2026-05', '2026-06'])
  })

  it('exposes the observed pooled totals so no consumer has to rebuild them', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const flows = [
      { income: 1111.11, expense: 999.99 },
      { income: 2222.22, expense: 1888.88 },
      { income: 3333.33, expense: 2777.77 },
      { income: 44444.44, expense: 33333.33 },
      { income: 55555.55, expense: 44444.44 },
      { income: 2333.31, expense: 1666.65 },
    ]
    const txns = COMPLETE_MONTHS.flatMap((month, i) =>
      ledger([month], flows[i].income, flows[i].expense),
    )
    const built = computeMonthlyData(txns, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)
    const pooled = sumFlows(flows)

    expect(analysis.totalIncome).toBe(pooled.income)
    expect(analysis.totalExpense).toBe(pooled.expense)
    // The reconstitution the CFP call sites used to do is NOT the same number.
    expect(analysis.avgMonthlyIncome * analysis.monthsAnalyzed).not.toBe(pooled.income)
  })

  it('matches the pooled definition exactly (not the ratio of the two averages)', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    // Uneven months: a ramp, so avg-of-averages and pooled would differ if the
    // divisors ever diverged.
    const flows = [
      { income: 20000, expense: 18000 },
      { income: 40000, expense: 30000 },
      { income: 100000, expense: 55000 },
      { income: 180000, expense: 70000 },
      { income: 250000, expense: 90000 },
      { income: 260000, expense: 95000 },
    ]
    const txns = COMPLETE_MONTHS.flatMap((month, i) =>
      ledger([month], flows[i].income, flows[i].expense),
    )
    const built = computeMonthlyData(txns, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)
    const expected = pooledSavingsRatePercent(flows)
    expect(analysis.savingsRate).toBeCloseTo(expected!, 10)
  })
})

// ─── The re-expressions and the near-neighbours ──────────────────────────────

describe('savingsRatePercentFromNet', () => {
  it('is a re-expression of savingsRatePercent, not a second definition', () => {
    // Callers that carry `net` (FIRE annual savings, the tax tile, the Sankey)
    // must land on the identical number as callers that carry `expense`.
    const income = 6_197_586.6
    const expense = 3_963_936.11
    expect(savingsRatePercentFromNet(income - expense, income)).toBeCloseTo(
      savingsRatePercent({ income, expense })!,
      10,
    )
  })

  it('inherits the null-on-no-income and no-clamp rules', () => {
    expect(savingsRatePercentFromNet(-400, 0)).toBeNull()
    expect(savingsRatePercentFromNet(-94140.54, 13511.11)).toBeCloseTo(-696.77, 1)
  })
})

describe('shareOfIncomePercent', () => {
  it('divides one flow by income, and is NOT a savings rate', () => {
    // Numerator is a single flow, so 60k of essentials on 100k income is 60%,
    // where the savings rate over the same pair is 40%.
    expect(shareOfIncomePercent(60000, 100000)).toBeCloseTo(60, 10)
  })

  it('takes the fallback the call site chose, because the two disagree', () => {
    // With no income, essentials consume everything (100) while debt service
    // consumes nothing (0). A single baked-in default would be wrong for one of
    // them, which is why the parameter exists.
    expect(shareOfIncomePercent(8000, 0, 100)).toBe(100)
    expect(shareOfIncomePercent(8000, 0)).toBe(0)
    expect(shareOfIncomePercent(8000, -100, 100)).toBe(100)
  })
})

describe('investmentAllocationRatePercent', () => {
  it('scores a saver who invests nothing at zero, unlike the savings rate', () => {
    // The whole reason this has its own name: parking a surplus in a bank
    // account is a 40% savings rate and 0% allocation.
    const income = 100000
    expect(savingsRatePercent({ income, expense: 60000 })).toBeCloseTo(40, 10)
    expect(investmentAllocationRatePercent(0, income)).toBe(0)
  })

  it('counts investment transfers that the savings rate excludes entirely', () => {
    expect(investmentAllocationRatePercent(25000, 100000)).toBeCloseTo(25, 10)
  })

  it('reports a net-withdrawal period as negative rather than clamping', () => {
    // Redeeming more than was contributed is a real signal, not a floor at 0.
    expect(investmentAllocationRatePercent(-50000, 200000)).toBeCloseTo(-25, 10)
  })
})

// ─── The one mapping into the CFP scorer ─────────────────────────────────────

describe('cfpInputsFromAnalysis', () => {
  const noInvestment = () => false

  /** Uneven ramp: `avg * count` and the observed sum are different numbers. */
  const RAMP = [
    { income: 1111.11, expense: 999.99 },
    { income: 2222.22, expense: 1888.88 },
    { income: 3333.33, expense: 2777.77 },
    { income: 44444.44, expense: 33333.33 },
    { income: 55555.55, expense: 44444.44 },
    { income: 2333.31, expense: 1666.65 },
  ]

  const analyse = (flows: PeriodFlows[]) => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const txns = COMPLETE_MONTHS.flatMap((month, i) => ledger([month], flows[i].income, flows[i].expense))
    const built = computeMonthlyData(txns, noInvestment)
    return computeAnalysis(built!.months, built!.monthlyData)
  }

  it('forwards the OBSERVED pooled sums, never avgMonthly * monthsAnalyzed', () => {
    // This is the defect the mapping exists to prevent: both call sites used to
    // reconstitute the totals from the averages, which is a lossy round-trip
    // that shifts the weighted composite with no failing test.
    const analysis = analyse(RAMP)
    const inputs = cfpInputsFromAnalysis(analysis)
    const pooled = sumFlows(RAMP)

    expect(inputs.totalIncome).toBe(pooled.income)
    expect(inputs.totalExpenses).toBe(pooled.expense)
    expect(inputs.totalIncome).not.toBe(analysis.avgMonthlyIncome * analysis.monthsAnalyzed)
  })

  it('nets investment flows so a withdrawal cannot read as a contribution', () => {
    const analysis = analyse(RAMP)
    expect(cfpInputsFromAnalysis(analysis).netInvestments).toBe(
      analysis.totalInvestmentInflow - analysis.totalInvestmentOutflow,
    )
  })

  it('feeds computeCFPScore a savings rate equal to the shared definition', () => {
    // End-to-end: the scorer's first ratio must agree with lib/savingsRate, or
    // the health panel contradicts every other savings figure in the app.
    const analysis = analyse([
      { income: 100000, expense: 60000 },
      { income: 100000, expense: 60000 },
      { income: 100000, expense: 60000 },
      { income: 100000, expense: 60000 },
      { income: 100000, expense: 60000 },
      { income: 100000, expense: 60000 },
    ])
    const { ratios } = computeCFPScore(cfpInputsFromAnalysis(analysis))
    const savings = ratios.find((r) => r.name === 'Savings Rate')

    expect(savings).toBeDefined()
    expect(savings!.value).toBeCloseTo(40, 10)
    expect(savings!.value).toBeCloseTo(analysis.savingsRate, 10)
  })

  it('carries a net-negative period through as a negative rate', () => {
    const analysis = analyse(COMPLETE_MONTHS.map(() => ({ income: 50000, expense: 75000 })))
    const { ratios } = computeCFPScore(cfpInputsFromAnalysis(analysis))
    const savings = ratios.find((r) => r.name === 'Savings Rate')!

    expect(savings.value).toBeCloseTo(-50, 10)
    // Overspending by half your income is the bottom of the scale, not a
    // mid-range score, and the score itself stays inside 0..100.
    expect(savings.score).toBe(0)
    expect(savings.status).toBe('poor')
  })
})

// ─── Demo mode must not fork the definition ──────────────────────────────────

describe('generateDemoTotals', () => {
  it('returns what the real endpoint would for the same rows', () => {
    const totals = generateDemoTotals(ledger(COMPLETE_MONTHS, 100000, 60000))

    expect(totals.total_income).toBeCloseTo(600000, 10)
    expect(totals.total_expenses).toBeCloseTo(360000, 10)
    expect(totals.net_savings).toBeCloseTo(netSavings({ income: 600000, expense: 360000 }), 10)
    expect(totals.savings_rate).toBeCloseTo(40, 10)
    expect(totals.transaction_count).toBe(12)
  })

  it('leaves transfers out of both sides, like the shared definition', () => {
    // A SIP into an investment account is a change of asset form. If demo mode
    // counted it as an expense, the demo savings rate would read 15% here.
    const withSip = [
      ...ledger(COMPLETE_MONTHS, 100000, 60000),
      ...COMPLETE_MONTHS.map((month, i) => ({
        id: `sip${i}`, date: `${month}-10`, amount: 25000, type: 'Transfer',
        category: 'Investment', account: 'Bank SBI',
      })),
    ] as Transaction[]
    const totals = generateDemoTotals(withSip)

    expect(totals.total_expenses).toBeCloseTo(360000, 10)
    expect(totals.savings_rate).toBeCloseTo(40, 10)
    // Transfers are excluded from the flows but still counted as rows.
    expect(totals.transaction_count).toBe(18)
  })

  it('takes the explicit 0 fallback when the filtered window has no income', () => {
    // The API field is a plain number, so demo mode cannot return null here --
    // but it must not return Infinity or NaN either.
    const totals = generateDemoTotals(ledger(COMPLETE_MONTHS, 100000, 60000), {
      start_date: '2026-03-06',
      end_date: '2026-03-06',
    })

    expect(totals.total_income).toBe(0)
    expect(totals.total_expenses).toBeCloseTo(60000, 10)
    expect(totals.savings_rate).toBe(0)
    expect(totals.net_savings).toBeCloseTo(-60000, 10)
  })
})

// ─── One expense side, not two ───────────────────────────────────────────────

describe('every route agrees on what counts as expense', () => {
  const noInvestment = () => false

  /** Rent (real spending) plus an F&O loss booked as an Expense row. */
  const withLoss = (): Transaction[] =>
    COMPLETE_MONTHS.flatMap((month) => [
      { id: `i${month}`, date: `${month}-05`, amount: 100000, type: 'Income', category: 'Salary', account: 'Bank SBI' },
      { id: `e${month}`, date: `${month}-06`, amount: 40000, type: 'Expense', category: 'Rent', account: 'Bank SBI' },
      {
        id: `l${month}`, date: `${month}-07`, amount: 20000, type: 'Expense',
        category: 'Investment Losses', subcategory: 'F&O Loss', account: 'Bank SBI',
      },
    ])

  /**
   * The EXPENSE SIDE is one number everywhere. `healthScoreAnalysis` filtered it
   * with `isSpending` while `generateDemoTotals` summed every Expense row, so the
   * two routes disagreed on `total_expenses` for identical rows.
   */
  it('demo totals and the health analysis report the same expense side', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const txns = withLoss()

    const totals = generateDemoTotals(txns)
    const built = computeMonthlyData(txns, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)

    expect(totals.total_expenses).toBe(analysis.totalExpense)
    // 600k in, 240k of real spending: the loss is not consumption.
    expect(totals.total_expenses).toBeCloseTo(240000, 10)
  })

  /**
   * ...but the two RATES answer different questions and must NOT be forced equal.
   *
   * `_totals_payload` (backend/src/ledger_sync/api/calculations.py:142-148) is
   * `net_savings = income - expenses - losses` then
   * `savings_rate = net_savings / income`, so the endpoint's rate CARRIES the
   * loss: 40% on these rows. The health panel's metric excludes it from both
   * sides and answers the consumption question: 60%. Verified against the backend
   * arithmetic 2026-07-27; it returns 40 for a classified user and for a default
   * user whose `capital_loss_keys_for` set is empty, i.e. the published rate is
   * invariant to classification by design.
   */
  it('the endpoint field carries the loss while the health metric excludes it', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const txns = withLoss()
    const totals = generateDemoTotals(txns)
    const built = computeMonthlyData(txns, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)

    // Wealth-change rate: what the API field means.
    expect(totals.savings_rate).toBeCloseTo(40, 10)
    // Consumption rate: what the health metric means.
    expect(analysis.savingsRate).toBeCloseTo(60, 10)
    // The gap is real and is the whole point of keeping two names.
    expect(Math.abs(totals.savings_rate - analysis.savingsRate)).toBeCloseTo(20, 10)
  })

  it('keeps the demo payload internally consistent: rate === net / income', () => {
    const totals = generateDemoTotals(withLoss())
    expect(totals.net_savings).toBeCloseTo(600000 - 240000 - 120000, 10)
    // The invariant `_totals_payload` documents: the rate and the net on the same
    // payload always agree. Deriving the rate from `{income, spending}` would
    // publish 60 next to a net of 240000, i.e. two different "savings" answers
    // under one response.
    expect(totals.savings_rate).toBe(
      savingsRatePercentFromNet(totals.net_savings, totals.total_income),
    )
    // Every row is still counted: nothing is hidden, only reclassified.
    expect(totals.transaction_count).toBe(18)
  })

  it('forwards the same wealth-change rate to the KPI payload', () => {
    // `/api/analytics/kpis` computes its rate with
    // `calculator.calculate_savings_rate(income, total_expenses)` where
    // `calculate_totals` sums EVERY Expense row (calculator.py:31-34, no loss
    // split), so it also reads 40 on these rows. Verified 2026-07-27: /kpis,
    // /totals for a default user, and /totals for a classified user all give 40.
    const kpis = generateDemoKPIs(withLoss())
    expect(kpis.savings_rate).toBeCloseTo(40, 10)
  })

  it('collapses to one number when there is no loss to split', () => {
    // The two questions only diverge when a realised loss exists. Without one the
    // endpoint field and the consumption rate are the same number, which is why
    // this change is not a blanket shift of every demo rate.
    vi.setSystemTime(new Date(2026, 6, 27))
    const plain = ledger(COMPLETE_MONTHS, 100000, 40000)
    const totals = generateDemoTotals(plain)
    const built = computeMonthlyData(plain, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)
    expect(totals.savings_rate).toBeCloseTo(60, 10)
    expect(totals.savings_rate).toBeCloseTo(analysis.savingsRate, 10)
  })

  it('still counts brokerage fees on the same category as real spending', () => {
    // Not a whole-category move. A fee is the cost of investing -- real cash out
    // -- so it stays in the expense side even though it shares the taxonomy.
    const fees = [
      ...ledger(COMPLETE_MONTHS, 100000, 40000),
      ...COMPLETE_MONTHS.map((month, i) => ({
        id: `fee${i}`, date: `${month}-08`, amount: 500, type: 'Expense',
        category: 'Investment Losses', subcategory: 'Brokerage Fees', account: 'Bank SBI',
      })),
    ] as Transaction[]
    const totals = generateDemoTotals(fees)
    expect(totals.total_expenses).toBeCloseTo(40000 * 6 + 500 * 6, 10)
  })

  it('splits the loss out per month too, so the monthly buckets agree', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const monthly = generateDemoMonthlyAggregation(withLoss())
    const jan = monthly['2026-01']
    expect(jan.income).toBeCloseTo(100000, 10)
    expect(jan.expense).toBeCloseTo(40000, 10)
    // net_savings carries the loss; expense does not.
    expect(jan.net_savings).toBeCloseTo(100000 - 40000 - 20000, 10)
    // The loss row is still counted as an expense row.
    expect(jan.expense_count).toBe(2)
    expect(jan.transactions).toBe(3)
  })

  it('leaves a loss-free ledger byte-identical (the change is not a blanket shift)', () => {
    const plain = ledger(COMPLETE_MONTHS, 100000, 60000)
    const totals = generateDemoTotals(plain)
    expect(totals.total_expenses).toBe(360000)
    expect(totals.net_savings).toBe(netSavings({ income: 600000, expense: 360000 }))
    const monthly = generateDemoMonthlyAggregation(plain)
    expect(monthly['2026-01'].net_savings).toBe(40000)
  })
})
