import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildYearlyTaxData } from '@/lib/finance/taxHistory'
import { usePreferencesStore } from '@/store/preferencesStore'
import type { Transaction } from '@/types'
import { DEFAULT_GROWTH_ASSUMPTIONS, DEFAULT_SALARY_COMPONENTS } from '@/types/salary'

import { useTaxPlanning } from '../useTaxPlanning'
import type { TaxPlanningModel } from '../useTaxPlanning'

const mocks = vi.hoisted(() => ({
  transactions: vi.fn(),
  preferences: vi.fn(),
}))

vi.mock('@/hooks/api/useTransactions', () => ({ useTransactions: mocks.transactions }))
vi.mock('@/hooks/api/usePreferences', () => ({ usePreferences: mocks.preferences }))
vi.mock('@/lib/dateUtils', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/dateUtils')>(),
  getTodayKey: () => '2026-09-10',
}))

const ready = { isLoading: false, isError: false, refetch: vi.fn() }
const salary = { ...DEFAULT_SALARY_COMPONENTS, base_salary_annual: 3_000_000 }

function businessReceipt(date: string, amount: number): Transaction {
  return {
    id: `business-${date}`,
    date,
    amount,
    type: 'Income',
    category: 'Business/Self Employment Income',
    subcategory: 'Gig Work Income',
    account: 'Bank',
  }
}

function annualChartTax(planning: TaxPlanningModel) {
  const row = buildYearlyTaxData(
    planning.fyList,
    planning.transactionsByFY,
    planning.multiYearProjections,
    planning.currentFYLabel,
    planning.regimeOverride,
    planning.preferredRegime,
    planning.salaryIsNetOfTds,
  ).find((item) => item.fy === planning.effectiveFY)
  return row ? row.paidTax + row.projected : 0
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transactions.mockReturnValue({ ...ready, data: [] })
  mocks.preferences.mockReturnValue({ ...ready, data: { preferred_tax_regime: 'new' } })
  usePreferencesStore.setState({
    salaryStructure: { '2026-27': salary },
    rsuGrants: [],
    growthAssumptions: { ...DEFAULT_GROWTH_ASSUMPTIONS, projection_years: 2 },
  })
})

describe('tax planning income and deduction integration', () => {
  it('uses configured period EPF for recorded-net reconstruction and the paid-tax estimate', () => {
    const transactions = Array.from({ length: 12 }, (_, index): Transaction => {
      const calendarMonth = index + 4
      const year = calendarMonth > 12 ? 2027 : 2026
      const month = calendarMonth > 12 ? calendarMonth - 12 : calendarMonth
      const date = `${year}-${String(month).padStart(2, '0')}-28`
      return {
        id: `salary-${date}`, date, amount: 206_550, type: 'Income',
        category: 'Employment Income', subcategory: 'Salary', account: 'Bank',
      }
    })
    mocks.transactions.mockReturnValue({ ...ready, data: transactions })
    const { result } = renderHook(() => useTaxPlanning())

    expect(result.current.effectiveFY).toBe('FY 2026-27')
    expect(result.current.taxComputation.employmentCashDeductions).toBe(43_200)
    expect(Math.abs(result.current.display.gross - 3_000_000)).toBeLessThan(2)
    expect(Math.abs(result.current.display.totalTax - 478_200)).toBeLessThan(1)
    expect(Math.abs(result.current.display.net - 2_478_600)).toBeLessThan(1)
    expect(Math.abs(result.current.taxComputation.netAfterCashDeductions - 2_478_600)).toBeLessThan(1)
    expect(Math.abs((result.current.paidTaxEstimate?.taxPaid ?? 0) - 478_200)).toBeLessThan(1)
  })

  it('combines annual business and employment liability without changing the salary payroll scope', () => {
    mocks.transactions.mockReturnValue({
      ...ready, data: [businessReceipt('2026-08-15', 1_500_000)],
    })
    const { result } = renderHook(() => useTaxPlanning())

    expect(result.current.taxComputation.totalTax).toBe(109_200)
    act(() => result.current.setShowProjection(true))

    expect(result.current.annualTaxComputation?.grossTaxableIncome).toBe(4_500_000)
    expect(result.current.annualTaxComputation?.totalTax).toBe(946_200)
    expect(annualChartTax(result.current)).toBe(946_200)
    expect(result.current.display.gross).toBe(4_500_000)
    expect(result.current.display.totalTax).toBe(946_200)
    expect(result.current.display.slabBreakdown).toEqual(result.current.annualTaxComputation?.slabBreakdown)
    expect(result.current.display.net).toBeCloseTo(2_478_600, 5)
    expect(result.current.salaryProjection?.grossTaxable).toBe(3_000_000)
    expect(result.current.salaryProjection?.totalTax).toBe(478_200)
    expect(result.current.tdsSchedule.reduce((sum, row) => sum + row.monthlyTds, 0)).toBeCloseTo(478_200, 5)

    act(() => result.current.setRegimeOverride('old'))
    expect(result.current.annualTaxComputation?.totalTax).toBe(1_195_800)
    expect(annualChartTax(result.current)).toBe(1_195_800)
    expect(result.current.display.totalTax).toBe(1_195_800)
    expect(result.current.display.net).toBeCloseTo(2_229_000, 5)
    expect(result.current.salaryProjection?.totalTax).toBe(727_800)
  })

  it('keeps future records in that FY while using the same annual scope as its chart', () => {
    mocks.transactions.mockReturnValue({
      ...ready,
      data: [businessReceipt('2026-08-15', 1_500_000), businessReceipt('2027-04-15', 500_000)],
    })
    const { result } = renderHook(() => useTaxPlanning())
    act(() => result.current.goToNextFY())

    expect(result.current.useSalaryProjection).toBe(true)
    expect(result.current.annualTaxComputation?.otherTaxableIncome).toBe(500_000)
    expect(result.current.annualTaxComputation?.grossTaxableIncome).toBe(3_500_000)
    expect(result.current.annualTaxComputation?.totalTax).toBe(634_200)
    expect(annualChartTax(result.current)).toBe(634_200)
    expect(result.current.display.gross).toBe(3_500_000)
    expect(result.current.display.totalTax).toBe(634_200)
  })

  it('caps the employment deduction when the annual scenario is mostly business income', () => {
    usePreferencesStore.setState({
      salaryStructure: { '2026-27': { ...salary, base_salary_annual: 10_000, epf_monthly: 0 } },
    })
    mocks.transactions.mockReturnValue({
      ...ready, data: [businessReceipt('2026-08-15', 1_500_000)],
    })
    const { result } = renderHook(() => useTaxPlanning())
    act(() => result.current.setShowProjection(true))

    expect(result.current.annualTaxComputation?.grossEmploymentIncome).toBe(10_000)
    expect(result.current.standardDeduction).toBe(10_000)
    expect(result.current.display.gross).toBe(1_510_000)
    expect(result.current.display.totalTax).toBe(111_600)
    expect(annualChartTax(result.current)).toBe(111_600)
  })

  it('lists the explicit salary FY even before any transactions have been imported', () => {
    const { result } = renderHook(() => useTaxPlanning())
    expect(result.current.fyList).toContain('FY 2026-27')
    expect(result.current.effectiveFY).toBe('FY 2026-27')
    act(() => result.current.setShowProjection(true))
    expect(result.current.annualTaxComputation?.grossTaxableIncome).toBe(3_000_000)
    expect(result.current.annualTaxComputation?.totalTax).toBe(478_200)
  })

  it('updates the known deduction when the explicit salary settings change', async () => {
    mocks.transactions.mockReturnValue({
      ...ready,
      data: [{
        id: 'salary-april', date: '2026-04-28', amount: 206_550, type: 'Income',
        category: 'Employment Income', subcategory: 'Salary', account: 'Bank',
      }],
    })
    const { result } = renderHook(() => useTaxPlanning())
    expect(result.current.taxComputation.employmentCashDeductions).toBe(3_600)

    await act(() => usePreferencesStore.setState({
      salaryStructure: { '2026-27': { ...salary, epf_monthly: 0 } },
    }))
    expect(result.current.taxComputation.employmentCashDeductions).toBe(0)
    expect(result.current.currentFYData?.recordedEmploymentCashDeductions).toBe(0)
  })
})
