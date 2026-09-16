import { describe, expect, it } from 'vitest'

import { resolveAnalysisPeriod, resolveEarningStart, type EarningEvidence } from '../analysisPeriod'
import { computeIncomeMetrics } from '../incomeMetrics'

const now = new Date('2026-09-16T12:00:00Z')
const income = (date: string, category: string, subcategory = '', amount = 100): EarningEvidence =>
  ({ date, category, subcategory, amount, type: 'Income' })

describe('earning boundary', () => {
  const evidence = [
    income('2019-01-01', 'Gift'), income('2020-01-01', 'Allowance'),
    income('2021-01-01', 'Employment Income', 'Reimbursement'),
    income('2022-01-01', 'Refund', 'Salary'),
    income('2022-02-01', 'Scholarship', 'Stipend'),
    income('2023-06-01', 'Employment Income', 'Stipend'),
    income('2024-08-01', 'Employment Income', 'Salary'),
  ]

  it('prefers saved employment start to earlier internships and later salary', () => {
    expect(resolveEarningStart('2024-02-01', evidence, now)).toEqual({ date: '2024-02-01', source: 'saved' })
  })

  it('infers genuine employment, ignoring gifts, allowances, reimbursements and refunds', () => {
    expect(resolveEarningStart(null, evidence.toReversed(), now)).toEqual({ date: '2023-06-01', source: 'inferred' })
  })

  it('does not use investment income, nonpositive payroll, or future payroll as evidence', () => {
    expect(resolveEarningStart('invalid', [
      income('2020-01-01', 'Interest'), income('2021-01-01', 'Dividend'),
      income('2024-01-01', 'Salary', '', 0), income('2024-02-01', 'Salary', '', -100),
      income('2027-01-01', 'Salary'),
    ], now)).toEqual({ date: null, source: 'unknown' })
  })

  it('validates saved dates and preserves a valid future start as an empty current period', () => {
    expect(resolveEarningStart('2024-02-30', evidence, now).source).toBe('inferred')
    const start = resolveEarningStart('2027-01-01', evidence, now)
    expect(resolveAnalysisPeriod(['2026-08'], { earningStartDate: start.date, recentMonths: 24, now }).months).toEqual([])
  })
})

describe('calendar analysis period', () => {
  it('takes exactly 24 trailing completed months, excluding old college and future history', () => {
    const result = resolveAnalysisPeriod(['2019-01', '2024-02', '2026-09', '2027-02'], {
      earningStartDate: '2024-02-01', recentMonths: 24, now,
    })
    expect(result.months).toHaveLength(24)
    expect(result.startDate).toBe('2024-09-01')
    expect(result.endDate).toBe('2026-08-31')
  })

  it('counts sparse and trailing empty months after employment, not just observed buckets', () => {
    const result = resolveAnalysisPeriod(['2019-01', '2026-06', '2026-08'], {
      earningStartDate: '2026-05-15', recentMonths: 24, now,
    })
    expect(result.months).toEqual(['2026-05', '2026-06', '2026-07', '2026-08'])
    expect(result.startDate).toBe('2026-05-15')
  })

  it('keeps an explicitly selected historic end and handles a leap February', () => {
    const result = resolveAnalysisPeriod(['2024-01', '2024-02', '2026-08'], {
      startDate: '2024-01-01', endDate: '2024-02-29', now,
    })
    expect(result.months).toEqual(['2024-01', '2024-02'])
    expect(result.endDate).toBe('2024-02-29')
  })

  it('never includes the current month in current health even on its last day', () => {
    const result = resolveAnalysisPeriod(['2026-07', '2026-08'], {
      earningStartDate: '2026-07-01', recentMonths: 24, now: new Date('2026-08-31T12:00:00Z'),
    })
    expect(result.months).toEqual(['2026-07'])
  })
})

describe('earnings-aware income metrics with selected chart history', () => {
  it('excludes college from averages but retains history and a post-start income gap', () => {
    const rows = [
      { month: '2023-12', income: 1000 }, { month: '2024-01', income: 0 },
      { month: '2024-02', income: 100000 }, { month: '2024-04', income: 100000 },
    ]
    const result = computeIncomeMetrics(rows, { earningStartDate: '2024-02-01', now })
    expect(result.avgIncome).toBeCloseTo(200000 / 3)
    expect(result.incomeSeries).toEqual([100000, 0, 100000])
    expect(result.monthlyTrendData.map((row) => row.month)).toEqual(['2023-12', '2024-01', '2024-02', '2024-03', '2024-04'])
    expect(result.monthlyTrendData[2].incomeAvg).toBeUndefined()
    expect(result.monthlyTrendData[4].incomeAvg).toBeCloseTo(200000 / 3)
    expect(rows).toHaveLength(4)
  })

  it('reports a real income stop instead of dropping the final zero', () => {
    const result = computeIncomeMetrics([
      { month: '2026-06', income: 100000 }, { month: '2026-07', income: 100000 },
    ], { earningStartDate: '2026-06-01', endDate: '2026-08-31', now })
    expect(result.growthRate).toBe(-100)
    expect(result.avgIncome).toBeCloseTo(200000 / 3)
  })

  it('preserves selected college chart data without claiming an earning-period average', () => {
    const result = computeIncomeMetrics([{ month: '2020-01', income: 1000 }], {
      earningStartDate: '2024-02-01', startDate: '2020-01-01', endDate: '2020-01-31', now,
    })
    expect(result.monthlyTrendData[0].income).toBe(1000)
    expect(result.averagePeriod.months).toEqual([])
    expect(result.growthRate).toBeUndefined()
  })
})
