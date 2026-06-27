import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  FY_START_MONTH,
  calculateTax,
  getFYFromDate,
} from '@/lib/taxCalculator'
import { projectFiscalYear, projectMultipleYears } from '@/lib/projectionCalculator'
import {
  buildTdsSchedule,
  rsuExtrasByFyMonth,
  computeTaxPaidTillDate,
  type TdsMonthRow,
} from '@/lib/tdsScheduleCalculator'
import { MONTHS_PER_YEAR } from '@/lib/dateUtils'
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
      taxable: preferences?.taxable_income_categories || [],
      investmentReturns: preferences?.investment_returns_categories || [],
      nonTaxable: preferences?.non_taxable_income_categories || [],
      other: preferences?.other_income_categories || [],
    }),
    [preferences],
  )

  const transactionsByFY = useMemo(
    () => groupTransactionsByFY(allTransactions, fiscalYearStartMonth, incomeClassification, epfTaxableFraction),
    [allTransactions, fiscalYearStartMonth, incomeClassification, epfTaxableFraction],
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
    salaryIsNetOfTds,
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

  // Forward TDS schedule -- flat baseline on regular salary, with a one-month
  // spike whenever an RSU vesting lands. Driven purely by the salary structure
  // (base/bonus = certain, RSU = dated), so it is computed whenever salary data
  // exists for this FY -- independent of the projection toggle. (The page-level
  // `salaryProjection` is null outside projection mode, so we project here on
  // its own to keep the TDS chart available on the normal current-FY view.)
  const tdsProjection = useMemo<ProjectedFYBreakdown | null>(() => {
    if (!hasSalaryData) return null
    return projectFiscalYear(
      effectiveFYForProjector,
      salaryStructure,
      rsuGrants,
      growthAssumptions,
      fiscalYearStartMonth,
    )
  }, [
    hasSalaryData,
    effectiveFYForProjector,
    salaryStructure,
    rsuGrants,
    growthAssumptions,
    fiscalYearStartMonth,
  ])

  const tdsSchedule = useMemo<TdsMonthRow[]>(() => {
    if (!tdsProjection) return []
    // Base = certain recurring comp ONLY (exclude bonus AND RSU), so the flat
    // monthly baseline = tax(base)/12 -- the exact same per-month figure the
    // summary cards use. Bonus + RSU are the "extra" that spikes in its month.
    const baseAnnual = Math.max(
      0,
      tdsProjection.grossTaxable - tdsProjection.bonus - tdsProjection.rsuIncome,
    )
    // Bonus is an annual amount in the salary structure -- spread it evenly
    // across the 12 months (recurring monthly bonus), so each month's spike is
    // the tax on one month's slice (e.g. base ~29.8k + bonus tax ~14.6k = ~45k),
    // NOT one giant April lump. RSU stays a dated one-month spike (Aug/Feb).
    const rsuExtras = rsuExtrasByFyMonth(rsuGrants, fyYear, fiscalYearStartMonth)
    const extraByMonth: Record<number, number> = { ...rsuExtras }
    if (tdsProjection.bonus > 0) {
      const bonusPerMonth = tdsProjection.bonus / MONTHS_PER_YEAR
      for (let m = 0; m < MONTHS_PER_YEAR; m++) {
        extraByMonth[m] = (extraByMonth[m] ?? 0) + bonusPerMonth
      }
    }
    const projected = buildTdsSchedule({
      regularMonthlyIncome: baseAnnual / MONTHS_PER_YEAR,
      extraByMonth,
      fyStartMonth: fiscalYearStartMonth,
      slabs: taxSlabs,
      standardDeduction,
      isNewRegime,
      fyStartYear: fyYear,
    })

    // Reconcile the PAID (past) months with the cards: replace their projected
    // TDS with the actual per-month figure derived from salary actually
    // received (total tax paid / months), so "Deducted" bars match the cards.
    // Future months keep the projection ("Expected").
    if (isCurrentFY && !useSalaryProjection && salaryMonthsCount > 0) {
      const actual = computeTaxPaidTillDate({
        baseAnnual,
        monthsPaid: salaryMonthsCount,
        receivedNet: netTaxableIncome,
        slabs: taxSlabs,
        standardDeduction,
        isNewRegime,
        fyStartYear: fyYear,
      })
      const actualPerMonth = actual.taxPaid / salaryMonthsCount
      return projected.map((row) =>
        row.monthIndex < salaryMonthsCount
          ? { ...row, monthlyTds: actualPerMonth }
          : row,
      )
    }
    return projected
  }, [
    tdsProjection,
    rsuGrants,
    fyYear,
    fiscalYearStartMonth,
    taxSlabs,
    standardDeduction,
    isNewRegime,
    isCurrentFY,
    useSalaryProjection,
    salaryMonthsCount,
    netTaxableIncome,
  ])

  const multiYearProjections = useMemo<ProjectedFYBreakdown[]>(() => {
    if (!hasSalaryData) return []
    return projectMultipleYears(salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth)
  }, [hasSalaryData, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth])

  // "Tax paid till date" (toggle ON, live current-FY view). Models real TDS:
  // base salary TDS is cut every month paid (so it is non-zero even early in
  // the year), plus the marginal tax on any bonus/RSU actually received.
  //   base = certain recurring comp = grossTaxable - bonus - RSU
  //   bonus received = actual bonus + RSU credits from transactions
  // Only the "Tax Already Paid" and "Taxable Income" cards consume this; the
  // "Salaried Income" card always shows what was actually received, untouched.
  const cardOverride = useMemo(() => {
    if (!showTdsSchedule || !tdsProjection || !isCurrentFY || useSalaryProjection) return null
    if (salaryMonthsCount <= 0) return null

    // Base = certain recurring comp from Settings (everything except bonus/RSU).
    const baseAnnual = Math.max(
      0,
      tdsProjection.grossTaxable - tdsProjection.bonus - tdsProjection.rsuIncome,
    )

    const tillDate = computeTaxPaidTillDate({
      baseAnnual,
      monthsPaid: salaryMonthsCount,
      // Actual salary credited to the bank so far (net of TDS); bonus is
      // backed out from whatever was received above the expected base.
      receivedNet: netTaxableIncome,
      slabs: taxSlabs,
      standardDeduction,
      isNewRegime,
      fyStartYear: fyYear,
    })

    return {
      taxableIncome: tillDate.incomeReceived,
      taxAlreadyPaid: tillDate.taxPaid,
    }
  }, [
    showTdsSchedule,
    tdsProjection,
    isCurrentFY,
    useSalaryProjection,
    salaryMonthsCount,
    netTaxableIncome,
    taxSlabs,
    standardDeduction,
    isNewRegime,
    fyYear,
  ])

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

  return {
    isLoading,
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
    tdsSchedule,
    showTdsSchedule,
    cardOverride,
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
