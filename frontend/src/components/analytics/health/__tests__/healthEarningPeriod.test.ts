import { describe, expect, it } from 'vitest'

import { computeAnalysis, createEmptyBucket } from '../healthScoreAnalysis'
import { scoreIncomeStability } from '../healthScoreScorers'
import { computeCurrentHealth } from '../currentHealthAnalysis'
import { cfpInputsFromAnalysis } from '../healthScoreAnalysis'
import type { Transaction } from '@/types'
import { computeCFPScore } from '@/lib/financialHealthCalculator'

describe('employment gaps in health analysis', () => {
  it('includes a zero-income month in income stability', () => {
    const months = ['2025-01', '2025-02', '2025-03']
    const monthly = Object.fromEntries(months.map((month, index) => [
      month, { ...createEmptyBucket(), income: index === 1 ? 0 : 100000, expense: 40000 },
    ]))
    const analysis = computeAnalysis(months, monthly)
    expect(analysis.avgMonthlyIncome).toBeCloseTo(200000 / 3)
    expect(analysis.incomeCV).toBeGreaterThan(40)
    expect(scoreIncomeStability(analysis).score).toBeLessThan(90)
  })

  it('does not award perfect income stability for an entire window without income', () => {
    const analysis = computeAnalysis(['2025-01'], { '2025-01': createEmptyBucket() })
    expect(scoreIncomeStability(analysis).score).toBe(0)
  })
})

describe('recent health cashflow and lifetime assets', () => {
  const now = new Date('2026-09-16T12:00:00Z')
  const employment = ['2026-05', '2026-06', '2026-08'].flatMap((month): Transaction[] => [
    { id: `${month}-income`, date: `${month}-05`, type: 'Income', category: 'Salary', amount: 100000, account: 'Bank' },
    ...[1, 2, 3].map((day): Transaction => ({
      id: `${month}-rent-${day}`, date: `${month}-0${day}`, type: 'Expense', category: 'Rent', amount: 10000, account: 'Bank',
    })),
  ])
  const oldSavings: Transaction[] = [
    { id: 'college-gift', date: '2019-01-01', type: 'Income', category: 'Gift', amount: 50000, account: 'Bank' },
    { id: 'past-salary', date: '2024-02-01', type: 'Income', category: 'Salary', amount: 100000, account: 'Bank' },
  ]

  it('keeps sparse July in the divisor and never mutates the lifetime ledger', () => {
    const rows = [...oldSavings, ...employment]
    const before = structuredClone(rows)
    const result = computeCurrentHealth(rows, () => false, { earningStartDate: '2026-05-01', now })!
    expect(result.period.months).toEqual(['2026-05', '2026-06', '2026-07', '2026-08'])
    expect(result.analysis.avgMonthlyIncome).toBe(75000)
    expect(result.analysis.totalIncome).toBe(300000)
    expect(result.analysis.cumulativeNetSavings).toBe(360000)
    expect(result.analysis.emergencyFundMonths).toBe(360000 / 22500)
    expect(cfpInputsFromAnalysis(result.analysis).cumulativeNetSavings).toBe(360000)
    expect(rows).toEqual(before)
  })

  it('retains observed lifetime assets and liabilities unchanged while averaging recent expenses', () => {
    const balances = { liquidAssets: 900000, investmentAssets: 2000000, totalLiabilities: 50000, totalAssets: 2900000, netWorth: 2850000 }
    const result = computeCurrentHealth([...oldSavings, ...employment], () => false, {
      earningStartDate: '2026-05-01', balances, now,
    })!
    expect(result.analysis.balances).toBe(balances)
    expect(cfpInputsFromAnalysis(result.analysis).balances).toBe(balances)
    expect(result.analysis.emergencyFundMonths).toBe(40)
  })

  it('retains old investment flows in the balance proxy but not recent investing ratios', () => {
    const rows: Transaction[] = [...oldSavings, ...employment, {
      id: 'old-investment', date: '2024-03-01', type: 'Transfer',
      category: 'Transfer', amount: 100000, account: 'Bank', from_account: 'Bank', to_account: 'Investment',
    }]
    const result = computeCurrentHealth(rows, (name) => name === 'Investment', {
      earningStartDate: '2026-05-01', now,
    })!
    expect(result.analysis.totalInvestmentInflow).toBe(0)
    const inputs = cfpInputsFromAnalysis(result.analysis)
    expect(computeCFPScore(inputs).ratios.find((ratio) => ratio.name === 'Investment Ratio')?.value).toBe(0)
    expect(result.analysis.emergencyFundMonths).toBeCloseTo(260000 / 22500)
  })

  it('excludes unfinished and future income from health while retaining current lifetime flows', () => {
    const rows: Transaction[] = [...employment,
      { ...employment[0], id: 'current', date: '2026-09-01', amount: 12345 },
      { ...employment[0], id: 'future', date: '2026-10-01', amount: 999999 },
    ]
    const result = computeCurrentHealth(rows, () => false, { earningStartDate: '2026-05-01', now })!
    expect(result.analysis.totalIncome).toBe(300000)
    expect(result.analysis.cumulativeNetSavings).toBe(222345)
  })
})
