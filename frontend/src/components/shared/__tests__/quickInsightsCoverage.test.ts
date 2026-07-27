import { describe, expect, it } from 'vitest'

import {
  buildQuickInsights,
  recurringCoverageLabel,
  type QuickInsightsParams,
} from '../quickInsightsData'
import { RECENT_INCOME_MONTHS, typicalMonthlyIncome } from '../recentIncome'

/**
 * Guards the Recurring Coverage denominator against the defect it shipped with:
 * dividing a present-day monthly obligation by an ALL-TIME MEAN income.
 *
 * Real-ledger anchors (monthly_summaries, 91 periods 2019-01..2026-07):
 *   active EXPENSE commitments      38 rows -> 115,027.89/month
 *   all-time mean monthly income    6,197,586.60 / (2769/30.44) = 68,130.93
 *   median of last 12 complete mths 216,756.94  (2025-07..2026-06)
 *   coverage, mean denominator      168.8%  ("High fixed cost load")
 *   coverage, recent-median denom    53.1%
 */
const REAL_LAST_12: readonly number[] = [
  227_402.55, 290_927.0, 203_856.7, 214_955.9, 199_879.04, 216_717.91,
  202_955.89, 210_520.69, 216_795.97, 225_835.32, 225_100.41, 246_233.18,
]
const REAL_LAST_12_PERIODS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
] as const

const REAL_FIXED_COMMITMENTS = 115_027.89
const REAL_RECENT_MEDIAN = 216_756.94
const REAL_ALL_TIME_MEAN = 68_130.93

const summary = (period: string, total: number) => ({ period, income: { total } })
const NOW = new Date('2026-07-26T00:00:00Z')

/** The real ledger's 91 periods, newest-first as the endpoint returns them. */
function realSummaries() {
  const early = Array.from({ length: 78 }, (_, i) => {
    const month = i % 12
    const year = 2019 + Math.floor(i / 12)
    return summary(`${year}-${String(month + 1).padStart(2, '0')}`, 17_131 + i * 100)
  }).filter((s) => s.period < '2025-07')
  const recent = REAL_LAST_12_PERIODS.map((p, i) => summary(p, REAL_LAST_12[i]))
  return [...early, ...recent, summary('2026-07', 4700)].reverse()
}

describe('typicalMonthlyIncome', () => {
  it('returns the median of the last 12 complete months on the real ledger', () => {
    expect(typicalMonthlyIncome(realSummaries(), NOW)).toBeCloseTo(REAL_RECENT_MEDIAN, 2)
  })

  it('is nowhere near the all-time mean it replaced', () => {
    const typical = typicalMonthlyIncome(realSummaries(), NOW)
    expect(typical).not.toBeNull()
    expect(typical! / REAL_ALL_TIME_MEAN).toBeGreaterThan(3)
  })

  it('excludes the month in progress, which reads low', () => {
    // 2026-07 held only 4,700 at measurement time. Including it would pull the
    // median of a 13-month window down.
    const withCurrent = typicalMonthlyIncome(realSummaries(), NOW)
    const asIfComplete = typicalMonthlyIncome(realSummaries(), new Date('2026-08-01T00:00:00Z'))
    expect(withCurrent).toBeCloseTo(REAL_RECENT_MEDIAN, 2)
    expect(asIfComplete).not.toBeCloseTo(REAL_RECENT_MEDIAN, 2)
  })

  it('takes the newest window regardless of the order rows arrive in', () => {
    const rows = realSummaries()
    const oldestFirst = [...rows].reverse()
    expect(typicalMonthlyIncome(oldestFirst, NOW)).toBeCloseTo(REAL_RECENT_MEDIAN, 2)
  })

  it('drops zero-income months, which cannot serve as a divisor', () => {
    // The real ledger has one: 2019-02.
    const rows = [
      summary('2026-04', 0),
      summary('2026-05', 100),
      summary('2026-06', 300),
    ]
    expect(typicalMonthlyIncome(rows, NOW)).toBe(200)
  })

  it('uses every complete month when fewer than the window exist', () => {
    const rows = [summary('2026-05', 100), summary('2026-06', 500)]
    expect(typicalMonthlyIncome(rows, NOW)).toBe(300)
  })

  it('caps the window at RECENT_INCOME_MONTHS', () => {
    // 24 complete months rising 1000..24000; the newest 12 median is 18,500,
    // while all 24 would median at 12,500.
    const rows = Array.from({ length: 24 }, (_, i) => {
      const month = i % 12
      const year = 2024 + Math.floor(i / 12)
      return summary(`${year}-${String(month + 1).padStart(2, '0')}`, (i + 1) * 1000)
    })
    expect(RECENT_INCOME_MONTHS).toBe(12)
    expect(typicalMonthlyIncome(rows, new Date('2026-01-15T00:00:00Z'))).toBe(18_500)
  })

  it('returns null when no complete month carries income', () => {
    expect(typicalMonthlyIncome(undefined, NOW)).toBeNull()
    expect(typicalMonthlyIncome([], NOW)).toBeNull()
    expect(typicalMonthlyIncome([summary('2026-07', 4700)], NOW)).toBeNull()
    expect(typicalMonthlyIncome([summary('2026-06', 0)], NOW)).toBeNull()
  })
})

describe('Recurring Coverage card', () => {
  const params = (recurringCoverage: number | null): QuickInsightsParams => ({
    totalIncome: 6_197_586.6,
    totalExpenses: -3_994_751.41,
    netSavings: 2_202_835.19,
    savingsRate: 35.5,
    incomeChange: '',
    expenseChange: '',
    savingsChange: '',
    fixedCommitmentsMonthly: REAL_FIXED_COMMITMENTS,
    fixedCount: 38,
    recurringCoverage,
  })
  const icons = new Proxy({}, { get: () => () => null }) as never
  const money = (n: number) => `Rs${Math.round(n)}`
  const cardFor = (coverage: number | null) =>
    buildQuickInsights(params(coverage), icons, money).find((i) => i.title === 'Recurring Coverage')

  it('publishes the recent-median coverage, not the all-time-mean one', () => {
    const honest = (REAL_FIXED_COMMITMENTS / REAL_RECENT_MEDIAN) * 100
    const defect = (REAL_FIXED_COMMITMENTS / REAL_ALL_TIME_MEAN) * 100
    expect(honest).toBeCloseTo(53.1, 1)
    expect(defect).toBeCloseTo(168.8, 1)
    expect(cardFor(honest)?.value).toBe('53.1%')
  })

  it('withholds the card when no recent-income baseline exists', () => {
    expect(cardFor(null)).toBeUndefined()
  })

  it('keeps the Fixed Commitments card even without a coverage denominator', () => {
    const items = buildQuickInsights(params(null), icons, money)
    expect(items.find((i) => i.title === 'Fixed Commitments')?.value).toBe('Rs115028')
  })

  it('names the denominator in the subtitle so a wrong one is visible', () => {
    expect(recurringCoverageLabel(53.1)).toBe(
      "High fixed cost load vs typical recent month's income",
    )
    expect(recurringCoverageLabel(35)).toBe(
      "Moderate fixed cost load vs typical recent month's income",
    )
    expect(recurringCoverageLabel(12)).toBe(
      "Low fixed cost load vs typical recent month's income",
    )
  })
})
