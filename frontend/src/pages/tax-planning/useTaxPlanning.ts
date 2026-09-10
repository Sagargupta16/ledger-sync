import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  FY_START_MONTH,
  getFYFromDate,
  parseFYStartYear,
} from '@/lib/taxCalculator'
import { projectFiscalYear, projectMultipleYears } from '@/lib/projectionCalculator'
import {
  applyProjectionTaxRegime,
  buildPayrollPlanning,
  taxPlanningDisplay,
  taxOverviewMetrics,
} from '@/lib/finance/payrollPlanning'
import { getTodayKey, MONTHS_PER_YEAR } from '@/lib/dateUtils'
import type { ProjectedFYBreakdown } from '@/types/salary'
import {
  usePreferencesStore,
  selectSalaryStructure,
  selectRsuGrants,
  selectGrowthAssumptions,
} from '@/store/preferencesStore'
import {
  computePrevFYDisplay,
  groupTransactionsByFY,
} from '@/lib/finance/taxHistory'
import { computeAnnualTaxPlanning, computeTaxForFY } from '@/lib/finance/taxPlanning'
import type { TaxRegimeOverride } from './types'

export function useTaxPlanning() {
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const allTransactions = transactionsQuery.data
  const preferences = preferencesQuery.data
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [showProjection, setShowProjection] = useState(false)

  const salaryStructure = usePreferencesStore(selectSalaryStructure)
  const rsuGrants = usePreferencesStore(selectRsuGrants)
  const growthAssumptions = usePreferencesStore(selectGrowthAssumptions)
  const hasSalaryData = Object.keys(salaryStructure).length > 0

  const preferredRegime = preferences?.preferred_tax_regime || 'new'
  const showTdsSchedule = preferences?.show_tds_schedule ?? false
  // Recorded salary is net of TDS by default (bank-statement amounts); when off,
  // the recorded amount is the taxable gross and tax is computed on it directly.
  const salaryIsNetOfTds = preferences?.salary_is_net_of_tds ?? true
  const [regimeOverride, setRegimeOverride] = useState<TaxRegimeOverride>(null)

  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || FY_START_MONTH

  // EPF inflows are exempt by default; the user can opt in to taxing a chosen
  // fraction (Settings > EPF withdrawal taxability). 0..1 fraction.
  const epfTaxableFraction = preferences?.epf_withdrawal_taxable
    ? (preferences.epf_taxable_percent ?? 100) / 100
    : 0

  const incomeClassification = useMemo(
    () => ({
      taxable: preferences?.taxable_income_categories ?? [],
      investmentReturns: preferences?.investment_returns_categories ?? [],
      nonTaxable: preferences?.non_taxable_income_categories ?? [],
      other: preferences?.other_income_categories ?? [],
    }),
    [preferences],
  )

  const transactionsByFY = useMemo(
    () =>
      groupTransactionsByFY(
        allTransactions ?? [],
        fiscalYearStartMonth,
        incomeClassification,
        epfTaxableFraction,
        salaryStructure,
      ),
    [allTransactions, fiscalYearStartMonth, incomeClassification, epfTaxableFraction, salaryStructure],
  )

  const txFyList = useMemo(
    () =>
      Object.keys(transactionsByFY)
        .sort((a, b) => a.localeCompare(b))
        .reverse(),
    [transactionsByFY],
  )

  const projectedFYList = useMemo(() => {
    if (!hasSalaryData) return []
    const salaryFYs = Object.keys(salaryStructure).sort((a, b) => a.localeCompare(b))
    const latestSalaryFY = salaryFYs.at(-1)
    if (!latestSalaryFY) return []
    const latestStart = parseFYStartYear(latestSalaryFY)
    const futureFYs: string[] = []
    for (let i = 0; i <= growthAssumptions.projection_years; i++) {
      const yr = latestStart + i
      const end = (yr + 1) % 100
      futureFYs.push(`FY ${yr}-${String(end).padStart(2, '0')}`)
    }
    return futureFYs
  }, [hasSalaryData, salaryStructure, growthAssumptions.projection_years])

  const fyList = useMemo(() => {
    const allFYs = new Set([...txFyList, ...projectedFYList])
    return [...allFYs].sort((a, b) => a.localeCompare(b)).reverse()
  }, [txFyList, projectedFYList])

  // `getTodayKey()`, not `toISOString().split('T')[0]`. The latter is a UTC key,
  // so for the first 5.5 hours of an IST day it reports yesterday -- and on
  // 1 April that is the PREVIOUS fiscal year, which would default the whole tax
  // page (slabs, TDS schedule, projection) to the wrong FY.
  const currentFYLabel = getFYFromDate(getTodayKey(), fiscalYearStartMonth)

  const effectiveFY =
    selectedFY || (fyList.includes(currentFYLabel) ? currentFYLabel : fyList[0]) || ''

  const isFutureFY = parseFYStartYear(effectiveFY) > parseFYStartYear(currentFYLabel)
  const isCurrentFY = effectiveFY === currentFYLabel
  const useSalaryProjection = hasSalaryData && (isFutureFY || (showProjection && isCurrentFY))

  const currentFYData = (effectiveFY ? transactionsByFY[effectiveFY] : null) ?? null
  const income = currentFYData?.income ?? 0
  const expense = currentFYData?.expense ?? 0
  const netTaxableIncome = currentFYData?.taxableIncome ?? 0
  const salaryMonthsCount = currentFYData?.salaryMonths?.size ?? 0

  const taxComputation = useMemo(() => computeTaxForFY(
    effectiveFY,
    netTaxableIncome,
    salaryMonthsCount,
    regimeOverride,
    preferredRegime,
    salaryIsNetOfTds,
    {
      hasEmploymentIncome: currentFYData?.hasEmploymentIncome ?? false,
      recordedEmploymentIncome: currentFYData?.employmentTaxableIncome ?? 0,
      recordedEmploymentCashDeductions: currentFYData?.recordedEmploymentCashDeductions ?? 0,
    },
  ), [
    effectiveFY, netTaxableIncome, salaryMonthsCount, regimeOverride,
    preferredRegime, salaryIsNetOfTds, currentFYData,
  ])
  const {
    fyYear,
    newRegimeAvailable,
    isNewRegime,
    taxSlabs,
    regimeLabel,
    standardDeduction: recordedStandardDeduction,
  } = taxComputation

  const effectiveFYForProjector = effectiveFY.replace(/^FY\s+/i, '')

  const salaryPlan = useMemo<ProjectedFYBreakdown | null>(() => {
    if (!hasSalaryData) return null
    return projectFiscalYear(
      effectiveFYForProjector,
      salaryStructure,
      rsuGrants,
      growthAssumptions,
      fiscalYearStartMonth,
    )
  }, [
    hasSalaryData, effectiveFYForProjector, salaryStructure, rsuGrants,
    growthAssumptions, fiscalYearStartMonth,
  ])

  const selectedProjection = useMemo(
    () => useSalaryProjection && salaryPlan
      ? applyProjectionTaxRegime(salaryPlan, taxComputation.selectedRegime)
      : null,
    [useSalaryProjection, salaryPlan, taxComputation.selectedRegime],
  )
  const salaryProjection = selectedProjection?.projection ?? null
  const annualTaxComputation = useMemo(
    () => salaryProjection ? computeAnnualTaxPlanning({
      recordedTax: taxComputation,
      projectedEmploymentIncome: salaryProjection.grossTaxable,
      projectedEmploymentCashDeductions: salaryProjection.cashDeductions,
      projectedSalaryMonthsCount: salaryProjection.grossTaxable > 0 ? MONTHS_PER_YEAR : 0,
    }) : null,
    [salaryProjection, taxComputation],
  )
  const standardDeduction = annualTaxComputation?.standardDeduction ?? recordedStandardDeduction
  const hasEmploymentIncome = annualTaxComputation?.hasEmploymentIncome ?? taxComputation.hasEmploymentIncome

  const payroll = useMemo(() => buildPayrollPlanning({
    projection: salaryPlan,
    tax: taxComputation,
    fyData: currentFYData,
    fyStartMonth: fiscalYearStartMonth,
    isCurrentFY,
    useSalaryProjection,
  }), [salaryPlan, taxComputation, currentFYData, fiscalYearStartMonth, isCurrentFY, useSalaryProjection])

  const multiYearProjections = useMemo<ProjectedFYBreakdown[]>(() => {
    if (!hasSalaryData) return []
    return projectMultipleYears(salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth)
      .map((projection) => applyProjectionTaxRegime(projection, taxComputation.selectedRegime).projection)
  }, [
    hasSalaryData, salaryStructure, rsuGrants, growthAssumptions,
    fiscalYearStartMonth, taxComputation.selectedRegime,
  ])

  const display = taxPlanningDisplay(taxComputation, selectedProjection, income, annualTaxComputation)
  const overviewMetrics = taxOverviewMetrics(display.gross, display.totalTax, display.income, expense)

  const prevFYDisplay = useMemo(
    () =>
      computePrevFYDisplay({
        effectiveFY,
        currentFYLabel,
        transactionsByFY,
        regimeOverride,
        preferredRegime,
        hasSalaryData,
        salaryStructure,
        rsuGrants,
        growthAssumptions,
        fiscalYearStartMonth,
        isNewRegime,
        salaryIsNetOfTds,
      }),
    [
      effectiveFY,
      currentFYLabel,
      transactionsByFY,
      regimeOverride,
      preferredRegime,
      hasSalaryData,
      salaryStructure,
      rsuGrants,
      growthAssumptions,
      fiscalYearStartMonth,
      isNewRegime,
      salaryIsNetOfTds,
    ],
  )

  const currentIndex = fyList.indexOf(effectiveFY)
  const canGoBack = currentIndex < fyList.length - 1
  const canGoForward = currentIndex > 0

  const goToPreviousFY = () => {
    if (canGoBack) setSelectedFY(fyList[currentIndex + 1])
  }
  const goToNextFY = () => {
    if (canGoForward) setSelectedFY(fyList[currentIndex - 1])
  }

  const retry = () => {
    void Promise.all([transactionsQuery.refetch(), preferencesQuery.refetch()])
  }

  return {
    isLoading: transactionsQuery.isLoading || preferencesQuery.isLoading,
    isError: transactionsQuery.isError || preferencesQuery.isError,
    retry,
    preferredRegime,
    salaryIsNetOfTds,
    regimeOverride,
    setRegimeOverride,
    showProjection,
    setShowProjection,
    fyList,
    effectiveFY,
    currentFYLabel,
    currentFYData,
    isCurrentFY,
    hasSalaryData,
    useSalaryProjection,
    transactionsByFY,
    multiYearProjections,
    tdsSchedule: payroll.schedule,
    showTdsSchedule,
    paidTaxEstimate: payroll.paidEstimate,
    paidMonthIndices: payroll.paidMonthIndices,
    salaryProjection,
    overviewMetrics,
    taxComputation,
    annualTaxComputation,
    hasEmploymentIncome,
    netTaxableIncome,
    salaryMonthsCount,
    expense,
    fyYear,
    newRegimeAvailable,
    isNewRegime,
    taxSlabs,
    regimeLabel,
    standardDeduction,
    display,
    prevFYDisplay,
    canGoBack,
    canGoForward,
    goToPreviousFY,
    goToNextFY,
  }
}

export type TaxPlanningModel = ReturnType<typeof useTaxPlanning>
