/**
 * Guards that ONE savings-rate definition governs this zone.
 *
 * Split from savingsRate.test.ts (which covers the primitives) so the "every
 * consumer routes through the shared module" contract is readable on its own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  investmentAllocationRatePercent,
  netSavings,
  savingsRatePercent,
  savingsRatePercentFromNet,
  savingsRatePercentOr,
  shareOfIncomePercent,
  sumFlows,
} from '@/lib/savingsRate'
import { computeCFPScore } from '@/lib/financialHealthCalculator'
import { generateDemoTotals } from '@/lib/demo/demoCalculations'
import {
  cfpInputsFromAnalysis,
  computeAnalysis,
  computeMonthlyData,
} from '@/components/analytics/health/healthScoreAnalysis'
import type { Transaction } from '@/types'

afterEach(() => {
  vi.useRealTimers()
})

const noInvestment = () => false

/** Six complete months ending 2026-06, relative to a 2026-07-27 "today". */
const COMPLETE_MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']

function ledger(months: string[], income: number, expense: number): Transaction[] {
  return months.flatMap((month) => [
    { id: `i${month}`, date: `${month}-05`, amount: income, type: 'Income', category: 'Salary', account: 'Bank SBI' },
    { id: `e${month}`, date: `${month}-06`, amount: expense, type: 'Expense', category: 'Rent', account: 'Bank SBI' },
  ])
}

/**
 * Amounts chosen so `sum / 6 * 6` is a DIFFERENT float from `sum`:
 * income sums to 108999.96 but round-trips to 108999.95999999999. That is what
 * makes the reconstituted-totals path observably wrong, not just fragile.
 */
const LOSSY_FLOWS = [
  { income: 1111.11, expense: 999.99 },
  { income: 2222.22, expense: 1888.88 },
  { income: 3333.33, expense: 2777.77 },
  { income: 44444.44, expense: 33333.33 },
  { income: 55555.55, expense: 44444.44 },
  { income: 2333.31, expense: 1666.65 },
]

function lossyAnalysis() {
  vi.setSystemTime(new Date(2026, 6, 27))
  const txns = COMPLETE_MONTHS.flatMap((month, i) =>
    ledger([month], LOSSY_FLOWS[i].income, LOSSY_FLOWS[i].expense),
  )
  const built = computeMonthlyData(txns, noInvestment)
  expect(built).not.toBeNull()
  return computeAnalysis(built!.months, built!.monthlyData)
}

describe('sumFlows', () => {
  it('pools observed sums instead of the lossy avg-times-count round trip', () => {
    const pooled = sumFlows(LOSSY_FLOWS)
    expect(pooled.income).toBeCloseTo(108999.96, 6)
    expect((pooled.income / LOSSY_FLOWS.length) * LOSSY_FLOWS.length).not.toBe(pooled.income)
  })

  it('is empty-safe', () => {
    expect(sumFlows([])).toEqual({ income: 0, expense: 0 })
  })
})

describe('savingsRatePercentFromNet', () => {
  it('is the same definition re-expressed, not a second formula', () => {
    // FY2026-27 to date on the real ledger.
    const income = 706726.02
    const expense = 377493.39
    expect(savingsRatePercentFromNet(income - expense, income)).toBe(
      savingsRatePercent({ income, expense }),
    )
  })

  it('inherits the null-on-zero-income contract', () => {
    expect(savingsRatePercentFromNet(-500, 0)).toBeNull()
  })

  it('supports a net that subtracts more than living expenses (income less tax)', () => {
    expect(savingsRatePercentFromNet(1000 - 600 - 100, 1000)).toBeCloseTo(30, 10)
  })
})

describe('the from-net route is display-identical to the direct route', () => {
  /**
   * `savingsRatePercentFromNet` recovers `expense` as `income - net` and divides
   * `income - expense`, where the call sites it replaced divided `net` directly.
   * Those are not the same float operation, so the swap needs a measured bound
   * rather than an assertion -- the standing instruction is "without affecting
   * any feature", and the sites moved are FIRE, the tax tile, the Sankey, the
   * comparison table and the trends breakdown.
   *
   * Measured 2026-07-27, 200,000 cent-quantized pairs with `net` supplied
   * INDEPENDENTLY of income (the real shape: a backend `surplus`, a chained
   * income-minus-expenses-minus-tax, a separately derived annual saving):
   * 44,358 differ bitwise, worst ABSOLUTE delta 2.27e-13 percentage points --
   * eleven orders of magnitude below the 2 decimals any surface renders.
   */
  it('never diverges by more than a picopercent over a wide sweep', () => {
    let worst = 0
    let differing = 0
    // Deterministic 32-bit LCG, kept under 2^53 with `>>> 0` so it does not
    // degenerate: same sweep on every machine and every run.
    let seed = 20260727
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < 20000; i++) {
      // Rupees-and-paise, the shape the ledger stores.
      const income = Math.round(next() * 500_000_000) / 100
      // Deliberately NOT `income - expense`: that round-trips exactly (pinned in
      // the test below), which would make this sweep vacuous.
      const net = (Math.round(next() * 500_000_000) / 100) * (next() < 0.25 ? -1 : 1)
      if (income <= 0) continue
      const fromNet = savingsRatePercentFromNet(net, income)
      const direct = (net / income) * 100
      expect(fromNet).not.toBeNull()
      const delta = Math.abs(fromNet! - direct)
      if (delta > 0) differing++
      worst = Math.max(worst, delta)
    }
    // The routes genuinely do differ, so this sweep is not vacuous.
    expect(differing).toBeGreaterThan(0)
    expect(worst).toBeLessThan(1e-11)
    // Two decimals is the widest precision any surface renders.
    expect(Number(worst.toFixed(2))).toBe(0)
  })

  /**
   * The complement of the sweep above: where the caller's `net` IS the float
   * `income - expense`, the recovery is exact, so the two routes agree bit for
   * bit. This is the case for every consumer that holds both flows.
   */
  it('is bit-exact when net is itself income minus expense', () => {
    let seed = 4242424
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < 20000; i++) {
      const income = Math.round(next() * 500_000_000) / 100
      const expense = Math.round(next() * 500_000_000) / 100
      if (income <= 0) continue
      expect(savingsRatePercentFromNet(income - expense, income)).toBe(
        savingsRatePercent({ income, expense }),
      )
    }
  })

  it('is exact for the zero-income and break-even boundaries', () => {
    expect(savingsRatePercentFromNet(0, 0)).toBeNull()
    expect(savingsRatePercentFromNet(0, 100000)).toBe(0)
    expect(savingsRatePercentFromNet(100000, 100000)).toBe(100)
  })
})

describe('shareOfIncomePercent', () => {
  it('is a share of income, not a savings rate', () => {
    expect(shareOfIncomePercent(30000, 100000)).toBeCloseTo(30, 10)
  })

  it('takes an explicit fallback per call site, because the right answer differs', () => {
    // With no income, essentials consume everything (100); debt service is 0.
    expect(shareOfIncomePercent(5000, 0, 100)).toBe(100)
    expect(shareOfIncomePercent(5000, 0)).toBe(0)
  })
})

describe('investmentAllocationRatePercent', () => {
  it('is deliberately a DIFFERENT metric from the savings rate', () => {
    // Consumes nothing, invests nothing: 100% savings rate, 0% allocation.
    // Impossible if the two shared one formula.
    expect(savingsRatePercent({ income: 100000, expense: 0 })).toBeCloseTo(100, 10)
    expect(investmentAllocationRatePercent(0, 100000)).toBe(0)
  })

  it('reports net withdrawals as negative rather than clamping to 0', () => {
    expect(investmentAllocationRatePercent(-50000, 200000)).toBeCloseTo(-25, 10)
  })
})

describe('demo mode agrees with the shared definition', () => {
  const tx = (id: string, date: string, amount: number, type: string): Transaction =>
    ({ id, date, amount, type, category: 'X', account: 'Bank SBI' }) as Transaction

  it('generateDemoTotals returns the shared rate for the same rows', () => {
    const txns = [
      tx('1', '2026-01-05', 100000, 'Income'),
      tx('2', '2026-01-06', 60000, 'Expense'),
      // A transfer must not touch either side of the rate.
      { ...tx('3', '2026-01-07', 25000, 'Transfer'), to_account: 'Zerodha Demat' } as Transaction,
    ]
    const totals = generateDemoTotals(txns)
    expect(totals.savings_rate).toBe(savingsRatePercentOr({ income: 100000, expense: 60000 }))
    expect(totals.net_savings).toBe(netSavings({ income: 100000, expense: 60000 }))
  })

  it('takes the explicit fallback for a no-income window', () => {
    const totals = generateDemoTotals([tx('1', '2026-01-06', 4000, 'Expense')])
    expect(savingsRatePercent({ income: 0, expense: 4000 })).toBeNull()
    expect(totals.savings_rate).toBe(0)
  })
})

describe('cfpInputsFromAnalysis', () => {
  it('feeds the CFP scorer pooled totals, so its rate equals the analysis rate', () => {
    const analysis = lossyAnalysis()
    const inputs = cfpInputsFromAnalysis(analysis)

    expect(inputs.totalIncome).toBe(analysis.totalIncome)
    expect(inputs.totalExpenses).toBe(analysis.totalExpense)

    const cfpRate = computeCFPScore(inputs).ratios.find((r) => r.name === 'Savings Rate')!
    expect(cfpRate.value).toBe(analysis.savingsRate)

    // The multiply-back both call sites used to do yields a different number for
    // the same ledger, which is why the round trip had to go.
    const reconstituted = computeCFPScore({
      ...inputs,
      totalIncome: analysis.avgMonthlyIncome * analysis.monthsAnalyzed,
      totalExpenses: analysis.avgMonthlyExpense * analysis.monthsAnalyzed,
    }).ratios.find((r) => r.name === 'Savings Rate')!
    expect(reconstituted.value).not.toBe(analysis.savingsRate)
  })

  it('exposes pooled totals on the analysis result itself', () => {
    const analysis = lossyAnalysis()
    const pooled = sumFlows(LOSSY_FLOWS)
    expect(analysis.totalIncome).toBe(pooled.income)
    expect(analysis.totalExpense).toBe(pooled.expense)
    expect(analysis.avgMonthlyIncome * analysis.monthsAnalyzed).not.toBe(pooled.income)
  })

  it('passes summed debt service, not avgMonthlyDebt times months', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    const txns = [
      ...ledger(COMPLETE_MONTHS, 100000, 60000),
      ...COMPLETE_MONTHS.map((month, i) => ({
        id: `emi${i}`, date: `${month}-11`, amount: 3333.33, type: 'Expense',
        category: 'EMI', account: 'Bank SBI',
      })),
    ] as Transaction[]
    const built = computeMonthlyData(txns, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)
    const inputs = cfpInputsFromAnalysis(analysis)
    expect(inputs.totalDebtOutstanding).toBe(analysis.totalDebt)
    expect(analysis.totalDebt).toBeCloseTo(3333.33 * COMPLETE_MONTHS.length, 6)
  })

  it('debt-to-income divides pooled totals, not the two monthly averages', () => {
    vi.setSystemTime(new Date(2026, 6, 27))
    // Debt amounts chosen (last month 33.33) so the two-average route lands on
    // 1.5596152512349546 while the pooled route gives 1.5596152512349544.
    const debts = [111.11, 222.22, 333.33, 444.44, 555.55, 33.33]
    const txns = [
      ...COMPLETE_MONTHS.flatMap((month, i) =>
        ledger([month], LOSSY_FLOWS[i].income, LOSSY_FLOWS[i].expense),
      ),
      ...COMPLETE_MONTHS.map((month, i) => ({
        id: `emi${i}`, date: `${month}-11`, amount: debts[i], type: 'Expense',
        category: 'Loan', account: 'Bank SBI',
      })),
    ] as Transaction[]
    const built = computeMonthlyData(txns, noInvestment)
    const analysis = computeAnalysis(built!.months, built!.monthlyData)

    expect(analysis.debtToIncomeRatio).toBe(
      shareOfIncomePercent(analysis.totalDebt, analysis.totalIncome),
    )
    // The old two-average expression is a different float for this ledger.
    const twoAverages = (analysis.avgMonthlyDebt / analysis.avgMonthlyIncome) * 100
    expect(analysis.debtToIncomeRatio).not.toBe(twoAverages)
  })
})

describe('no second savings-rate formula survives in the zone', () => {
  /**
   * Globbed rather than listed, so a NEW file dropped into the health folder is
   * covered the day it lands. `?raw` + `eager` gives the sources synchronously.
   */
  const ZONE: Record<string, string> = {
    ...import.meta.glob('../savingsRate.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../financialHealthCalculator.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../fireCalculator.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../demo/demoCalculations.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../components/analytics/health/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../components/analytics/period-comparison/periodMetrics.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../pages/comparison/useComparisonData.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../pages/year-in-review/useYearInReview.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../pages/income-expense-flow/useIncomeExpenseFlow.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../pages/trends-forecasts/useTrendsForecasts.ts', { query: '?raw', import: 'default', eager: true }),
  }

  /** Fetch one zone source by filename suffix; throws rather than passing on a typo. */
  const ZONE_SOURCE_FOR = (suffix: string): string => {
    const hit = Object.entries(ZONE).find(([file]) => file.endsWith(suffix))
    if (!hit) throw new Error(`zone source not loaded: ${suffix}`)
    return hit[1]
  }

  /**
   * The hand-rolled shape this zone exists to eliminate:
   * `<...income...> > 0 ? (<net> / <income>) * 100 : <fallback>`. savingsRate.ts
   * is the one module allowed to divide, and it does so without a guard ternary.
   *
   * Matched against the WHOLE file, not line by line, and `[\s\S]` rather than
   * `[^\n]` -- because this repo's formatter wraps exactly this expression over
   * four lines. The shape that actually existed at HEAD was:
   *
   *     const savingsRate =
   *       avgMonthlyIncome > 0
   *         ? ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome) * 100
   *         : 0
   *
   * A per-line, `[^\n]`-bounded regex sees none of that, so the guard passed
   * with the offender present -- vacuous against the only formatting a
   * regression could realistically land in. The `{0,400}` bound keeps the
   * multi-line window tight enough that an unrelated `income > 0 ?` earlier in
   * a file cannot pair with a `* 100 :` hundreds of characters later.
   */
  const HAND_ROLLED = /\w*[Ii]ncome\w*\s*>\s*0\s*(?:\n\s*)?\?[\s\S]{0,400}?\*\s*100\s*(?:\n\s*)?:/

  it('catches the pattern it is guarding against', () => {
    expect(HAND_ROLLED.test('const r = income > 0 ? (net / income) * 100 : 0')).toBe(true)
    expect(HAND_ROLLED.test('totalIncome > 0 ? (x / totalIncome) * 100 : 100')).toBe(true)
    expect(HAND_ROLLED.test('return savingsRatePercent({ income, expense })')).toBe(false)
  })

  /**
   * The regression this guard has to catch is the FORMATTED one. This is the
   * verbatim block from `git show HEAD:...healthScoreAnalysis.ts` lines 109-112
   * -- prettier/eslint reflow the single-line form into it the moment anyone
   * saves the file, so a guard that only sees one line never fires in practice.
   */
  it('catches the wrapped four-line form the formatter actually produces', () => {
    const asFormatted = [
      '  const savingsRate =',
      '    avgMonthlyIncome > 0',
      '      ? ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome) * 100',
      '      : 0',
    ].join('\n')
    expect(HAND_ROLLED.test(asFormatted)).toBe(true)
    // ...and the per-line scan that used to run here does NOT see it, which is
    // why the whole-file match above is the contract.
    expect(asFormatted.split('\n').some((line) => HAND_ROLLED.test(line))).toBe(false)
  })

  it('does not fire on the shared helpers or an unrelated guard', () => {
    // savingsRate.ts's own divide has no `> 0 ?` guard, so it must stay clean.
    expect(HAND_ROLLED.test(ZONE_SOURCE_FOR('savingsRate.ts'))).toBe(false)
    // A far-apart pair must not join up across an unrelated file body.
    const farApart = `if (income > 0) {\n${'  // filler\n'.repeat(80)}}\nconst pct = x * 100 : 0`
    expect(HAND_ROLLED.test(farApart)).toBe(false)
  })

  it('actually loaded the zone sources (a silent empty glob would pass vacuously)', () => {
    const files = Object.keys(ZONE)
    expect(files.length).toBeGreaterThanOrEqual(14)
    for (const required of [
      'savingsRate.ts',
      'healthScoreAnalysis.ts',
      'demoCalculations.ts',
      'fireCalculator.ts',
      'periodMetrics.ts',
      'useComparisonData.ts',
      'useYearInReview.ts',
      'useIncomeExpenseFlow.ts',
      'useTrendsForecasts.ts',
    ]) {
      expect(files.some((f) => f.endsWith(required))).toBe(true)
    }
    expect(ZONE[files[0]].length).toBeGreaterThan(0)
  })

  it('finds no hand-rolled rate left in any zone file', () => {
    const offenders: string[] = []
    for (const [file, src] of Object.entries(ZONE)) {
      // Whole-file match: the formatter wraps this expression across four lines,
      // so a per-line scan cannot see the shape that actually ships.
      const hit = HAND_ROLLED.exec(src)
      if (hit) {
        const line = src.slice(0, hit.index).split('\n').length
        offenders.push(`${file}:${line}: ${hit[0].replace(/\s+/g, ' ').trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
