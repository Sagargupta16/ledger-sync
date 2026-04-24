import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  FY_START_MONTH,
  calculateTax,
  getFYFromDate,
} from '@/lib/taxCalculator'
import { projectFiscalYear, projectMultipleYears } from '@/lib/projectionCalculator'
import type { ProjectedFYBreakdown } from '@/types/salary'
import {
  usePreferencesStore,
  selectSalaryStructure,
  selectRsuGrants,
  selectGrowthAssumptions,
} from '@/store/preferencesStore'
import {
  computePrevFYDisplay,
  computeTaxForFY,
  groupTransactionsByFY,
} from './taxPlanningUtils'
import type { TaxRegimeOverride } from './types'

export function useTaxPlanning() {
  const { data: allTransactions = [], isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [showProjection, setShowProjection] = useState(false)

  const salaryStructure = usePreferencesStore(selectSalaryStructure)
  const rsuGrants = usePreferencesStore(selectRsuGrants)
  const growthAssumptions = usePreferencesStore(selectGrowthAssumptions)
  const hasSalaryData = Object.keys(salaryStructure).length > 0

  const preferredRegime = preferences?.preferred_tax_regime || 'new'
  const [regimeOverride, setRegimeOverride] = useState<TaxRegimeOverride>(null)

  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || FY_START_MONTH

  const incomeClassification = useMemo(
    () => ({
      taxable: preferences?.taxable_income_categories || [],
      investmentReturns: preferences?.investment_returns_categories || [],
      nonTaxable: preferences?.non_taxable_income_categories || [],
      other: preferences?.other_income_categories || [],
    }),
    [preferences],
  )

  const transactionsByFY = useMemo(
    () => groupTransactionsByFY(allTransactions, fiscalYearStartMonth, incomeClassification),
    [allTransactions, fiscalYearStartMonth, incomeClassification],
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
    const latestStart = Number.parseInt(latestSalaryFY.replace(/^FY\s*/i, ''), 10)
    const futureFYs: string[] = []
    for (let i = 1; i <= growthAssumptions.projection_years; i++) {
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

  const currentFYLabel = getFYFromDate(new Date().toISOString().split('T')[0], fiscalYearStartMonth)

  const effectiveFY =
    selectedFY || (fyList.includes(currentFYLabel) ? currentFYLabel : fyList[0]) || ''

  const isFutureFY = projectedFYList.includes(effectiveFY) && !(effectiveFY in transactionsByFY)
  const isCurrentFY = effectiveFY === currentFYLabel
  const useSalaryProjection = hasSalaryData && (isFutureFY || (showProjection && isCurrentFY))

  const currentFYData = effectiveFY ? transactionsByFY[effectiveFY] : null
  const income = currentFYData?.income || 0
  const expense = currentFYData?.expense || 0
  const netTaxableIncome = currentFYData?.taxableIncome || 0
  const salaryMonthsCount = currentFYData?.salaryMonths?.size || 0

  const taxComputation = computeTaxForFY(
    effectiveFY,
    netTaxableIncome,
    salaryMonthsCount,
    regimeOverride,
    preferredRegime,
  )
  const {
    fyYear,
    newRegimeAvailable,
    isNewRegime,
    taxSlabs,
    regimeLabel,
    standardDeduction,
    grossTaxableIncome,
    baseTax,
    slabBreakdown,
    rebate87A,
    surcharge,
    cess,
    professionalTax,
    taxAlreadyPaid,
  } = taxComputation

  const effectiveFYForProjector = effectiveFY.replace(/^FY\s+/i, '')

  const salaryProjection = useMemo<ProjectedFYBreakdown | null>(() => {
    if (!useSalaryProjection) return null
    return projectFiscalYear(
      effectiveFYForProjector,
      salaryStructure,
      rsuGrants,
      growthAssumptions,
      fiscalYearStartMonth,
    )
  }, [
    useSalaryProjection,
    effectiveFYForProjector,
    salaryStructure,
    rsuGrants,
    growthAssumptions,
    fiscalYearStartMonth,
  ])

  const salaryTaxResult = useMemo(() => {
    if (!salaryProjection) return null
    return calculateTax(
      salaryProjection.grossTaxable,
      taxSlabs,
      standardDeduction,
      true,
      12,
      isNewRegime,
      fyYear,
    )
  }, [salaryProjection, taxSlabs, standardDeduction, isNewRegime, fyYear])

  const multiYearProjections = useMemo<ProjectedFYBreakdown[]>(() => {
    if (!hasSalaryData) return []
    return projectMultipleYears(salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth)
  }, [hasSalaryData, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth])

  const display = useMemo(() => {
    if (salaryTaxResult && salaryProjection) {
      return {
        gross: salaryProjection.grossTaxable,
        net: salaryProjection.grossTaxable - salaryTaxResult.totalTax,
        totalTax: salaryTaxResult.totalTax,
        baseTax: salaryTaxResult.tax,
        cess: salaryTaxResult.cess,
        professionalTax: salaryTaxResult.professionalTax,
        slabBreakdown: salaryTaxResult.slabBreakdown,
        rebate87A: salaryTaxResult.rebate87A,
        surcharge: salaryTaxResult.surcharge,
        income: salaryProjection.grossTaxable,
      }
    }
    return {
      gross: grossTaxableIncome,
      net: netTaxableIncome,
      totalTax: taxAlreadyPaid,
      baseTax,
      cess,
      professionalTax,
      slabBreakdown,
      rebate87A,
      surcharge,
      income,
    }
  }, [
    salaryTaxResult,
    salaryProjection,
    grossTaxableIncome,
    netTaxableIncome,
    taxAlreadyPaid,
    baseTax,
    cess,
    professionalTax,
    slabBreakdown,
    rebate87A,
    surcharge,
    income,
  ])

  const prevFYDisplay = useMemo(
    () =>
      computePrevFYDisplay(
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
      ),
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

  return {
    isLoading,
    preferredRegime,
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
