import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { classifyIncomeType } from '@/lib/preferencesUtils'
import { formatCurrency } from '@/lib/formatters'
import {
  FY_START_MONTH,
  calculateTax,
  calculateGrossFromNet,
  getFYFromDate,
  getStandardDeduction,
  parseFYStartYear,
  getTaxSlabs,
  getNewRegimeSlabs,
} from '@/lib/taxCalculator'
import { projectFiscalYear, projectMultipleYears } from '@/lib/projectionCalculator'
import type { Transaction } from '@/types'
import type { ProjectedFYBreakdown } from '@/types/salary'
import { PageHeader, ChartContainer, chartTooltipProps, GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate, BAR_RADIUS, ACTIVE_DOT } from '@/components/ui'
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { rawColors } from '@/constants/colors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import TaxSummaryCards from '@/components/analytics/TaxSummaryCards'
import TaxSlabBreakdown from '@/components/analytics/TaxSlabBreakdown'
import TaxSummaryGrid from '@/components/analytics/TaxSummaryGrid'
import EffectiveTaxRateChart from '@/components/analytics/EffectiveTaxRateChart'
import TaxableIncomeTable from '@/components/analytics/TaxableIncomeTable'
import { usePreferencesStore, selectSalaryStructure, selectRsuGrants, selectGrowthAssumptions } from '@/store/preferencesStore'

/** Result of classifying an income transaction for tax grouping */
interface IncomeGroupAccumulator {
  [key: string]: {
    total: number
    transactions: Transaction[]
  }
}

interface FYData {
  income: number
  expense: number
  taxableIncome: number
  salaryMonths: Set<string>
  transactions: Transaction[]
  incomeGroups: IncomeGroupAccumulator
}

/** Classify and accumulate an income transaction into the FY group */
function classifyAndAccumulateIncome(
  tx: Transaction,
  fyData: FYData,
  incomeClassification: { taxable: string[]; investmentReturns: string[]; nonTaxable: string[]; other: string[] },
): void {
  const incomeType = classifyIncomeType(tx, incomeClassification)
  const note = tx.note?.toLowerCase() || ''
  const subcategory = (tx.subcategory || '').toLowerCase()

  const isEPF =
    note.includes('aws epf') ||
    note.includes('epf withdrawal') ||
    (tx.category === 'Employment Income' && tx.subcategory === 'EPF Contribution')

  if (isEPF) {
    const epfTaxablePortion = tx.amount / 2
    fyData.taxableIncome += epfTaxablePortion
    fyData.incomeGroups.EPF.total += epfTaxablePortion
    fyData.incomeGroups.EPF.transactions.push(tx)
    return
  }

  if (incomeType !== 'taxable') return

  fyData.taxableIncome += tx.amount
  const isSalaryOrStipend = subcategory === 'salary' || subcategory === 'stipend'
  const isBonus = subcategory === 'bonuses' || subcategory === 'rsus'

  if (isSalaryOrStipend) {
    fyData.incomeGroups['Salary & Stipend'].total += tx.amount
    fyData.incomeGroups['Salary & Stipend'].transactions.push(tx)
    fyData.salaryMonths.add(tx.date.substring(0, 7))
  } else if (isBonus) {
    fyData.incomeGroups['Bonus'].total += tx.amount
    fyData.incomeGroups['Bonus'].transactions.push(tx)
  } else {
    fyData.incomeGroups['Other Taxable Income'].total += tx.amount
    fyData.incomeGroups['Other Taxable Income'].transactions.push(tx)
  }
}

/** Create an empty FY data bucket */
function createEmptyFYData(): FYData {
  return {
    income: 0,
    expense: 0,
    taxableIncome: 0,
    salaryMonths: new Set(),
    transactions: [],
    incomeGroups: {
      'Salary & Stipend': { total: 0, transactions: [] },
      Bonus: { total: 0, transactions: [] },
      EPF: { total: 0, transactions: [] },
      'Other Taxable Income': { total: 0, transactions: [] },
    },
  }
}

/** Group transactions by fiscal year, accumulating income/expense totals */
function groupTransactionsByFY(
  transactions: Transaction[],
  fiscalYearStartMonth: number,
  incomeClassification: { taxable: string[]; investmentReturns: string[]; nonTaxable: string[]; other: string[] },
): Record<string, FYData> {
  const grouped: Record<string, FYData> = {}
  for (const tx of transactions) {
    const fy = getFYFromDate(tx.date, fiscalYearStartMonth)
    if (!grouped[fy]) grouped[fy] = createEmptyFYData()
    grouped[fy].transactions.push(tx)
    if (tx.type === 'Income') {
      grouped[fy].income += tx.amount
      classifyAndAccumulateIncome(tx, grouped[fy], incomeClassification)
    } else if (tx.type === 'Expense') {
      grouped[fy].expense += tx.amount
    }
  }
  return grouped
}

type TaxRegimeOverride = 'new' | 'old' | null

interface YearlyTaxDatum { fy: string; paidTax: number; projected: number; cumulative: number }

function computePaidTax(
  fy: string,
  fyData: FYData,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
): number {
  const taxableAmt = (fyData.taxableIncome > 0) ? fyData.taxableIncome : fyData.income
  const salaryMonths = fyData.salaryMonths?.size || 0
  const computed = computeTaxForFY(fy, taxableAmt, salaryMonths, regimeOverride, preferredRegime)
  return Math.round(computed.taxAlreadyPaid)
}

function computeProjectedTax(
  hasTxData: boolean,
  projTotal: number,
  paidTax: number,
  fy: string,
  currentFYLabel: string,
): number {
  if (!hasTxData && projTotal > 0) return projTotal
  if (fy === currentFYLabel && projTotal > paidTax) return projTotal - paidTax
  return 0
}

/** Build yearly tax chart data from FY list and projections */
function buildYearlyTaxData(
  fyList: string[],
  transactionsByFY: Record<string, FYData>,
  multiYearProjections: ProjectedFYBreakdown[],
  currentFYLabel: string,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
): YearlyTaxDatum[] {
  const projectedTaxByFY: Record<string, number> = {}
  for (const p of multiYearProjections) projectedTaxByFY[p.fy] = p.totalTax

  const data = fyList.slice().reverse().map(fy => {
    const bareFY = fy.replace(/^FY\s+/i, '')
    const fyData = transactionsByFY[fy]
    const hasTxData = !!fyData
    const projTotal = Math.round(projectedTaxByFY[bareFY] ?? 0)

    const paidTax = hasTxData ? computePaidTax(fy, fyData, regimeOverride, preferredRegime) : 0
    const projected = computeProjectedTax(hasTxData, projTotal, paidTax, fy, currentFYLabel)

    return { fy, paidTax, projected, cumulative: 0 }
  })

  let cum = 0
  for (const d of data) { cum += d.paidTax + d.projected; d.cumulative = cum }
  return data
}

/** Determine the selected tax regime based on FY availability and user preference */
function resolveSelectedRegime(
  newRegimeAvailable: boolean,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
): 'new' | 'old' {
  if (!newRegimeAvailable) return 'old'
  if (regimeOverride) return regimeOverride
  return preferredRegime === 'old' ? 'old' : 'new'
}

/** Compute gross income and tax breakdown for the selected FY and regime */
function computeTaxForFY(
  selectedFY: string,
  netTaxableIncome: number,
  salaryMonthsCount: number,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
) {
  const fyYear = selectedFY ? parseFYStartYear(selectedFY) : 0
  const newRegimeAvailable = fyYear >= 2020
  const selectedRegime = resolveSelectedRegime(newRegimeAvailable, regimeOverride, preferredRegime)
  const isNewRegime = selectedRegime === 'new'
  const taxSlabs = getTaxSlabs(fyYear, selectedRegime)
  const regimeLabel = isNewRegime ? 'New Tax Regime' : 'Old Tax Regime (with 80C)'
  const standardDeduction = getStandardDeduction(fyYear)

  const hasEmploymentIncome = netTaxableIncome > 0
  const newRegimeSlabs = getNewRegimeSlabs(fyYear)

  const grossTaxableIncome = calculateGrossFromNet(netTaxableIncome, {
    slabs: newRegimeSlabs,
    standardDeduction,
    applyProfessionalTax: hasEmploymentIncome,
    salaryMonthsCount,
    isNewRegime: true,
    fyStartYear: fyYear,
  })

  const taxResult = calculateTax(
    grossTaxableIncome,
    taxSlabs,
    standardDeduction,
    hasEmploymentIncome,
    salaryMonthsCount,
    isNewRegime,
    fyYear,
  )

  return {
    fyYear,
    newRegimeAvailable,
    isNewRegime,
    taxSlabs,
    regimeLabel,
    standardDeduction,
    hasEmploymentIncome,
    grossTaxableIncome,
    baseTax: taxResult.tax,
    slabBreakdown: taxResult.slabBreakdown,
    rebate87A: taxResult.rebate87A,
    surcharge: taxResult.surcharge,
    cess: taxResult.cess,
    professionalTax: taxResult.professionalTax,
    taxAlreadyPaid: taxResult.totalTax,
  }
}

/** Tax regime toggle, projection toggle, and FY navigation action bar */
function TaxPageActions({
  isNewRegime,
  setRegimeOverride,
  newRegimeAvailable,
  isCurrentFY,
  showProjection,
  setShowProjection,
  selectedFY,
  canGoBack,
  canGoForward,
  goToPreviousFY,
  goToNextFY,
  hasSalaryData,
}: Readonly<{
  isNewRegime: boolean
  setRegimeOverride: (regime: 'new' | 'old') => void
  newRegimeAvailable: boolean
  isCurrentFY: boolean
  showProjection: boolean
  setShowProjection: (show: boolean) => void
  selectedFY: string
  canGoBack: boolean
  canGoForward: boolean
  goToPreviousFY: () => void
  goToNextFY: () => void
  hasSalaryData: boolean
}>) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Tax Regime Toggle — hidden for FYs before 2020-21 */}
      {newRegimeAvailable && <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setRegimeOverride('new')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            isNewRegime
              ? 'bg-primary text-white'
              : 'bg-white/5 text-muted-foreground hover:bg-white/10'
          }`}
        >
          New Regime
        </button>
        <button
          type="button"
          onClick={() => setRegimeOverride('old')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            isNewRegime
              ? 'bg-white/5 text-muted-foreground hover:bg-white/10'
              : 'bg-primary text-white'
          }`}
        >
          Old Regime
        </button>
      </div>}

      {/* Salary Projection Toggle */}
      {isCurrentFY && hasSalaryData && (
        <button
          onClick={() => setShowProjection(!showProjection)}
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            showProjection
              ? 'bg-primary text-white shadow-lg shadow-primary/50'
              : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
          }`}
        >
          {showProjection ? 'Showing Projection' : 'Project from Salary'}
        </button>
      )}

      {/* FY Navigation */}
      <div className="flex items-center gap-2">
        <motion.button
          onClick={goToPreviousFY}
          disabled={!canGoBack}
          className="p-2 rounded-lg glass-thin hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          whileTap={canGoBack ? { scale: 0.95 } : undefined}
          aria-label="Previous FY"
        >
          <ChevronLeft className="w-4 h-4" />
        </motion.button>

        <span className="text-white font-medium min-w-28 text-center">
          {selectedFY || 'Select FY'}
        </span>

        <motion.button
          onClick={goToNextFY}
          disabled={!canGoForward}
          className="p-2 rounded-lg glass-thin hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          whileTap={canGoForward ? { scale: 0.95 } : undefined}
          aria-label="Next FY"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  )
}

export default function TaxPlanningPage() {
  const { data: allTransactions = [], isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [showProjection, setShowProjection] = useState(false)

  // Salary structure & projections from preferences store
  const salaryStructure = usePreferencesStore(selectSalaryStructure)
  const rsuGrants = usePreferencesStore(selectRsuGrants)
  const growthAssumptions = usePreferencesStore(selectGrowthAssumptions)
  const hasSalaryData = Object.keys(salaryStructure).length > 0

  // Tax regime preference: default from user preferences, overridable via toggle
  const preferredRegime = preferences?.preferred_tax_regime || 'new'
  const [regimeOverride, setRegimeOverride] = useState<TaxRegimeOverride>(null)

  // Get fiscal year start month from preferences (default to April)
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || FY_START_MONTH

  // Get income classification from preferences for tax categorization
  const incomeClassification = useMemo(
    () => ({
      taxable: preferences?.taxable_income_categories || [],
      investmentReturns: preferences?.investment_returns_categories || [],
      nonTaxable: preferences?.non_taxable_income_categories || [],
      other: preferences?.other_income_categories || [],
    }),
    [preferences],
  )

  // Group transactions by Financial Year
  const transactionsByFY = useMemo(
    () => groupTransactionsByFY(allTransactions, fiscalYearStartMonth, incomeClassification),
    [allTransactions, fiscalYearStartMonth, incomeClassification],
  )

  // Get sorted FY list from transactions
  const txFyList = useMemo(() => {
    return Object.keys(transactionsByFY)
      .sort((a, b) => a.localeCompare(b))
      .reverse()
  }, [transactionsByFY])

  // Compute future projected FYs from salary structure + growth assumptions
  const projectedFYList = useMemo(() => {
    if (!hasSalaryData) return []
    const salaryFYs = Object.keys(salaryStructure).sort((a, b) => a.localeCompare(b))
    const latestSalaryFY = salaryFYs.at(-1)
    if (!latestSalaryFY) return []
    // Parse start year - handle both "2025-26" and "FY 2025-26" formats
    const latestStart = Number.parseInt(latestSalaryFY.replace(/^FY\s*/i, ''), 10)
    const futureFYs: string[] = []
    for (let i = 1; i <= growthAssumptions.projection_years; i++) {
      const yr = latestStart + i
      const end = (yr + 1) % 100
      futureFYs.push(`FY ${yr}-${String(end).padStart(2, '0')}`)
    }
    return futureFYs
  }, [hasSalaryData, salaryStructure, growthAssumptions.projection_years])

  // Merge transaction FYs with projected FYs into a combined sorted list
  const fyList = useMemo(() => {
    const allFYs = new Set([...txFyList, ...projectedFYList])
    return [...allFYs].sort((a, b) => a.localeCompare(b)).reverse()
  }, [txFyList, projectedFYList])

  // Current FY label for default selection
  const currentFYLabel = getFYFromDate(new Date().toISOString().split('T')[0], fiscalYearStartMonth)

  // Default to current FY if available, otherwise latest FY
  const effectiveFY = selectedFY || (fyList.includes(currentFYLabel) ? currentFYLabel : fyList[0]) || ''

  // Determine if the selected FY is a future projection (no transaction data)
  const isFutureFY = projectedFYList.includes(effectiveFY) && !(effectiveFY in transactionsByFY)
  const isCurrentFY = effectiveFY === currentFYLabel

  // Use salary projection when toggle is ON (current FY) or when viewing future FY
  const useSalaryProjection = hasSalaryData && (isFutureFY || (showProjection && isCurrentFY))

  // ── Derived values for selected FY ──────────────────────────────────

  const currentFYData = effectiveFY ? transactionsByFY[effectiveFY] : null
  const income = currentFYData?.income || 0
  const expense = currentFYData?.expense || 0
  const netTaxableIncome = currentFYData?.taxableIncome || 0
  const salaryMonthsCount = currentFYData?.salaryMonths?.size || 0

  // ── Tax computation for selected FY (transaction-based) ─────────────

  const {
    fyYear, newRegimeAvailable, isNewRegime, taxSlabs, regimeLabel,
    standardDeduction, grossTaxableIncome,
    baseTax, slabBreakdown, rebate87A, surcharge, cess,
    professionalTax, taxAlreadyPaid,
  } = computeTaxForFY(effectiveFY, netTaxableIncome, salaryMonthsCount, regimeOverride, preferredRegime)

  // ── Salary-based projection ────────────────────────────────────────

  const effectiveFYForProjector = effectiveFY.replace(/^FY\s+/i, '')

  const salaryProjection = useMemo<ProjectedFYBreakdown | null>(() => {
    if (!useSalaryProjection) return null
    return projectFiscalYear(effectiveFYForProjector, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth)
  }, [useSalaryProjection, effectiveFYForProjector, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth])

  // Recompute tax using the selected regime on salary gross (projection calculator always uses new regime)
  const salaryTaxResult = useMemo(() => {
    if (!salaryProjection) return null
    return calculateTax(salaryProjection.grossTaxable, taxSlabs, standardDeduction, true, 12, isNewRegime, fyYear)
  }, [salaryProjection, taxSlabs, standardDeduction, isNewRegime, fyYear])

  const multiYearProjections = useMemo<ProjectedFYBreakdown[]>(() => {
    if (!hasSalaryData) return []
    return projectMultipleYears(salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth)
  }, [hasSalaryData, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth])

  // ── Display values: salary projection overrides transaction-based ───

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
  }, [salaryTaxResult, salaryProjection, grossTaxableIncome, netTaxableIncome, taxAlreadyPaid, baseTax, cess, professionalTax, slabBreakdown, rebate87A, surcharge, income])

  // ── Previous FY values for YoY % change badges ─────────────────────

  const prevFYDisplay = useMemo(() => {
    if (!effectiveFY) return null
    const startYear = parseFYStartYear(effectiveFY)
    if (!startYear) return null
    const prevStart = startYear - 1
    const prevEnd = startYear % 100
    const prevFYLabel = `FY ${prevStart}-${String(prevEnd).padStart(2, '0')}`

    // Completed past FYs → use actual transaction data
    // Current/future FYs → use salary projection (partial tx data isn't comparable)
    const currentStart = parseFYStartYear(currentFYLabel)
    const prevIsComplete = prevStart < currentStart

    if (prevIsComplete) {
      const prevFYData = transactionsByFY[prevFYLabel]
      if (prevFYData) {
        const prevResult = computeTaxForFY(prevFYLabel, prevFYData.taxableIncome || 0, prevFYData.salaryMonths?.size || 0, regimeOverride, preferredRegime)
        return {
          net: prevFYData.taxableIncome || 0,
          gross: prevResult.grossTaxableIncome,
          totalTax: prevResult.taxAlreadyPaid,
        }
      }
    }

    // Current or future FY — use salary projection
    if (hasSalaryData) {
      const prevFYForProjector = prevFYLabel.replace(/^FY\s+/i, '')
      const prevProjection = projectFiscalYear(prevFYForProjector, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth)
      if (prevProjection) {
        const prevSlabs = getTaxSlabs(prevStart, isNewRegime ? 'new' : 'old')
        const prevStdDeduction = getStandardDeduction(prevStart)
        const prevTax = calculateTax(prevProjection.grossTaxable, prevSlabs, prevStdDeduction, true, 12, isNewRegime, prevStart)
        return {
          net: prevProjection.grossTaxable - prevTax.totalTax,
          gross: prevProjection.grossTaxable,
          totalTax: prevTax.totalTax,
        }
      }
    }

    return null
  }, [effectiveFY, currentFYLabel, hasSalaryData, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth, isNewRegime, transactionsByFY, regimeOverride, preferredRegime])

  // ── FY navigation ───────────────────────────────────────────────────

  const currentIndex = fyList.indexOf(effectiveFY)
  const canGoBack = currentIndex < fyList.length - 1
  const canGoForward = currentIndex > 0

  const goToPreviousFY = () => {
    if (canGoBack) setSelectedFY(fyList[currentIndex + 1])
  }
  const goToNextFY = () => {
    if (canGoForward) setSelectedFY(fyList[currentIndex - 1])
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="Tax Planning"
          subtitle={`Estimate your tax liability — ${regimeLabel}`}
          action={
            <TaxPageActions
              isNewRegime={isNewRegime}
              setRegimeOverride={setRegimeOverride}
              newRegimeAvailable={newRegimeAvailable}
              isCurrentFY={isCurrentFY}
              showProjection={showProjection}
              setShowProjection={setShowProjection}
              selectedFY={effectiveFY}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              goToPreviousFY={goToPreviousFY}
              goToNextFY={goToNextFY}
              hasSalaryData={hasSalaryData}
            />
          }
        />
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="space-y-6 md:space-y-8"
      >

        {fyList.length === 0 && !isLoading ? (
          <motion.div variants={fadeUpItem}>
            <ChartEmptyState height={300} message="No transaction data available. Upload your data to see tax estimates." />
          </motion.div>
        ) : (
        <>
        <motion.div variants={fadeUpItem}>
          <TaxSummaryCards
            isLoading={isLoading}
            netTaxableIncome={display.net}
            grossTaxableIncome={display.gross}
            taxAlreadyPaid={display.totalTax}
            isProjecting={useSalaryProjection}
            prevNetTaxableIncome={prevFYDisplay?.net}
            prevGrossTaxableIncome={prevFYDisplay?.gross}
            prevTaxAlreadyPaid={prevFYDisplay?.totalTax}
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TaxSlabBreakdown
            isNewRegime={isNewRegime}
            taxSlabs={taxSlabs}
            slabBreakdown={display.slabBreakdown}
            grossTaxableIncome={display.gross}
            standardDeduction={standardDeduction}
            fyYear={fyYear}
            baseTax={display.baseTax}
            rebate87A={display.rebate87A}
            surcharge={display.surcharge}
            cess={display.cess}
            professionalTax={display.professionalTax}
            totalTax={display.totalTax}
            isProjecting={useSalaryProjection}
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TaxSummaryGrid
            selectedFY={effectiveFY}
            grossTaxableIncome={display.gross}
            taxAlreadyPaid={display.totalTax}
            netTaxableIncome={display.net}
            totalIncome={display.income}
            totalExpense={expense}
            isProjecting={useSalaryProjection}
          />
        </motion.div>

        {/* Effective Tax Rate Curve */}
        <EffectiveTaxRateChart
          taxSlabs={taxSlabs}
          isNewRegime={isNewRegime}
          fyYear={fyYear}
          standardDeduction={standardDeduction}
          currentIncome={display.gross}
        />

        {!useSalaryProjection && (
          <motion.div variants={fadeUpItem}>
            <TaxableIncomeTable
              selectedFY={effectiveFY}
              incomeGroups={currentFYData?.incomeGroups}
              netTaxableIncome={netTaxableIncome}
            />
          </motion.div>
        )}

        {/* ── Tax Saving Suggestions ─────────────────────────────── */}
        <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-4 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-app-green/20 rounded-xl">
              <TrendingUp className="w-5 h-5 text-app-green" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Tax Saving Suggestions</h3>
              <p className="text-xs text-muted-foreground">
                {isNewRegime ? 'New Regime — Limited deductions, lower rates' : 'Old Regime — Maximize deductions to reduce taxable income'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isNewRegime ? (
              <>
                <TaxTip title="Standard Deduction" amount={standardDeduction} description="Automatically applied to salaried individuals. No action needed." />
                <TaxTip title="NPS — Employer Contribution" amount={null} description="Section 80CCD(2): Up to 14% of basic salary contributed by employer is deductible even in New Regime." />
                <TaxTip title="Home Loan Interest (Let-out)" amount={null} description="Section 24(b): Interest on loan for let-out property is fully deductible (no limit). Self-occupied is NOT allowed in New Regime." />
                <TaxTip title="Agniveer Corpus Fund" amount={null} description="Section 80CCH: Full deduction for contributions to the Agniveer scheme." />
                <TaxTip title="Section 87A Rebate" amount={fyYear >= 2025 ? 60000 : 25000} description={fyYear >= 2025 ? 'Income up to 12L: Full tax rebate (zero tax up to 12.75L after standard deduction).' : 'Income up to 7L: Full tax rebate (zero tax up to 7.75L after standard deduction).'} />
                <TaxTip title="Consider Old Regime?" amount={null} description="If you have significant 80C investments (1.5L), HRA, home loan interest, or medical insurance — Old Regime may save more. Compare both." />
              </>
            ) : (
              <>
                <TaxTip title="Section 80C" amount={150000} description="PPF, ELSS, LIC, EPF, tuition fees, home loan principal. Max deduction: 1.5L." />
                <TaxTip title="Section 80CCD(1B) — NPS" amount={50000} description="Additional 50K deduction for NPS contributions (over and above 80C)." />
                <TaxTip title="Section 80D — Health Insurance" amount={75000} description="Self/family: 25K (50K if senior). Parents: 25K (50K if senior). Total max: 75K-1L." />
                <TaxTip title="Section 24(b) — Home Loan Interest" amount={200000} description="Interest on self-occupied property loan: up to 2L deduction per year." />
                <TaxTip title="HRA Exemption" amount={null} description="If you live in rented housing and receive HRA as part of salary, claim exemption under Section 10(13A)." />
                <TaxTip title="Section 80E — Education Loan" amount={null} description="Full interest deduction on education loan for self, spouse, or children. No upper limit. Available for 8 years." />
                <TaxTip title="Section 80G — Donations" amount={null} description="50% or 100% deduction for donations to approved charities. Keep receipts with PAN of the organization." />
                <TaxTip title="Section 80TTA — Savings Interest" amount={10000} description="Interest from savings bank accounts: up to 10K deduction (50K for senior citizens under 80TTB)." />
              </>
            )}
          </div>
        </motion.div>

        {/* ── Yearly Tax History Chart ──────────────────────────── */}
        {fyList.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-2xl border border-border p-4 md:p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-500/10 rounded-xl">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Tax Per Year</h3>
                <p className="text-xs text-muted-foreground">Paid (red) vs projected (orange) with cumulative trend</p>
              </div>
            </div>
            {(() => {
              const yearlyTaxData = buildYearlyTaxData(fyList, transactionsByFY, multiYearProjections, currentFYLabel, regimeOverride, preferredRegime)
              if (yearlyTaxData.every(d => d.paidTax === 0 && d.projected === 0)) return <ChartEmptyState height={280} message="No tax liability found across years" />

              return (
                <ChartContainer height={300}>
                  <BarChart data={yearlyTaxData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                    <CartesianGrid {...GRID_DEFAULTS} />
                    <XAxis {...xAxisDefaults(yearlyTaxData.length)} dataKey="fy" />
                    <YAxis {...yAxisDefaults()} />
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number | undefined, name: string | undefined) => {
                        if (value === undefined || value === 0) return ['', '']
                        const labels: Record<string, string> = { paidTax: 'Tax Paid', projected: 'Projected Tax', cumulative: 'Cumulative' }
                        return [formatCurrency(value), labels[name ?? ''] ?? name]
                      }}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="paidTax" name="paidTax" stackId="tax" fill={rawColors.app.red} fillOpacity={0.7} maxBarSize={40}
                      isAnimationActive={shouldAnimate(yearlyTaxData.length)} animationDuration={600} animationEasing="ease-out"
                    />
                    <Bar dataKey="projected" name="projected" stackId="tax" fill={rawColors.app.orange} fillOpacity={0.5} radius={BAR_RADIUS} maxBarSize={40}
                      isAnimationActive={shouldAnimate(yearlyTaxData.length)} animationDuration={600} animationEasing="ease-out"
                    />
                    <Line type="monotone" dataKey="cumulative" name="cumulative" stroke={rawColors.app.blue} strokeWidth={2} strokeDasharray="6 3"
                      dot={false} activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                      isAnimationActive={shouldAnimate(yearlyTaxData.length)} animationDuration={600}
                    />
                  </BarChart>
                </ChartContainer>
              )
            })()}
          </motion.div>
        )}

        {/* ── Regime Comparison: When Old is Better ──────────────── */}
        {newRegimeAvailable && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-app-purple/20 rounded-xl">
              <ChevronRight className="w-5 h-5 text-app-purple" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Which Regime Saves You More?</h3>
              <p className="text-xs text-muted-foreground">
                Based on your income of {formatCurrency(display.gross)}
              </p>
            </div>
          </div>

          <RegimeComparison
            grossIncome={display.gross}
            fyYear={fyYear}
            standardDeduction={standardDeduction}
            salaryMonthsCount={salaryMonthsCount}
          />
        </motion.div>
        )}

        {/* Multi-Year Salary Projection Table */}
        {hasSalaryData && multiYearProjections.length > 1 && (
          <motion.div variants={fadeUpItem}>
            <MultiYearProjectionTable projections={multiYearProjections} />
          </motion.div>
        )}
        </>
        )}
      </motion.div>
      </div>
    </div>
  )
}

/** Small tip card used in the tax savings suggestions grid */
function TaxTip({ title, amount, description }: Readonly<{ title: string; amount: number | null; description: string }>) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {amount !== null && (
          <span className="text-xs font-semibold text-app-green">
            up to {formatCurrency(amount)}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

function calculateBreakEvenDeduction(
  grossIncome: number,
  fyYear: number,
  standardDeduction: number,
  salaryMonthsCount: number,
  newRegimeTax: number,
): number {
  for (let d = 0; d <= 1000000; d += 10000) {
    const oldWithDeductions = calculateTax(
      Math.max(0, grossIncome - d), getTaxSlabs(fyYear, 'old'),
      standardDeduction, true, salaryMonthsCount, false, fyYear,
    )
    if (oldWithDeductions.totalTax <= newRegimeTax) return d
  }
  return 0
}

function RegimeVerdictDetail({ newIsBetter, totalDeductions, breakEvenDeduction, grossIncome }: Readonly<{
  newIsBetter: boolean
  totalDeductions: number
  breakEvenDeduction: number
  grossIncome: number
}>) {
  if (newIsBetter && totalDeductions === 0 && breakEvenDeduction > 0) {
    return (
      <p className="text-sm mt-2 text-muted-foreground">
        Old Regime becomes better only if you claim at least{' '}
        <span className="font-semibold text-foreground">{formatCurrency(breakEvenDeduction)}</span>
        {' '}in deductions (80C + 80D + HRA + 24b etc). Enter your deductions above to check.
      </p>
    )
  }

  if (newIsBetter && breakEvenDeduction === 0 && grossIncome > 500000) {
    return (
      <p className="text-sm mt-2 text-muted-foreground">
        At your income level, New Regime is better even with maximum Old Regime deductions.
      </p>
    )
  }

  if (newIsBetter && totalDeductions > 0) {
    return (
      <p className="text-sm mt-2 text-muted-foreground">
        Even with {formatCurrency(totalDeductions)} in deductions, New Regime is cheaper. You need {formatCurrency(Math.max(0, breakEvenDeduction - totalDeductions))} more in deductions for Old Regime to win.
      </p>
    )
  }

  if (!newIsBetter) {
    return (
      <p className="text-sm mt-2 text-muted-foreground">
        {totalDeductions > 0
          ? `With ${formatCurrency(totalDeductions)} in deductions, Old Regime saves you more. Make sure to claim all these deductions when filing.`
          : "The Old Regime's higher slab rates are offset by deductions available. Enter your deductions above to see exact savings."}
      </p>
    )
  }

  return null
}

/** Regime comparison — shows tax under both regimes with optional deduction inputs */
function RegimeComparison({ grossIncome, fyYear, standardDeduction, salaryMonthsCount }: Readonly<{
  grossIncome: number
  fyYear: number
  standardDeduction: number
  salaryMonthsCount: number
}>) {
  const [sec80C, setSec80C] = useState(0)
  const [sec80D, setSec80D] = useState(0)
  const [hra, setHra] = useState(0)
  const [sec24b, setSec24b] = useState(0)
  const [showDeductions, setShowDeductions] = useState(false)

  const totalDeductions = sec80C + sec80D + hra + sec24b

  const newTax = calculateTax(grossIncome, getTaxSlabs(fyYear, 'new'), standardDeduction, true, salaryMonthsCount, true, fyYear)
  const oldRegimeIncome = Math.max(0, grossIncome - totalDeductions)
  const oldTax = calculateTax(oldRegimeIncome, getTaxSlabs(fyYear, 'old'), standardDeduction, true, salaryMonthsCount, false, fyYear)

  const newTotal = newTax.totalTax
  const oldTotal = oldTax.totalTax
  const diff = Math.abs(newTotal - oldTotal)
  const newIsBetter = newTotal <= oldTotal
  const oldIsBetter = !newIsBetter
  const betterRegime = newIsBetter ? 'New Regime' : 'Old Regime'

  const breakEvenDeduction = (newIsBetter && grossIncome > 0)
    ? calculateBreakEvenDeduction(grossIncome, fyYear, standardDeduction, salaryMonthsCount, newTotal)
    : 0

  if (grossIncome <= 0) return null

  return (
    <div className="space-y-4">
      {/* Side by side comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`p-4 rounded-xl border ${newIsBetter ? 'border-app-green/30 bg-app-green/5' : 'border-border bg-white/5'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">New Regime</span>
            {newIsBetter && <span className="text-caption font-semibold text-app-green px-2 py-0.5 rounded-full bg-app-green/20">Better</span>}
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(newTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {grossIncome > 0 ? ((newTotal / grossIncome) * 100).toFixed(1) : '0'}%
          </p>
        </div>
        <div className={`p-4 rounded-xl border ${oldIsBetter ? 'border-app-green/30 bg-app-green/5' : 'border-border bg-white/5'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Old Regime</span>
            {oldIsBetter && <span className="text-caption font-semibold text-app-green px-2 py-0.5 rounded-full bg-app-green/20">Better</span>}
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(oldTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {grossIncome > 0 ? ((oldTotal / grossIncome) * 100).toFixed(1) : '0'}%
            {totalDeductions > 0 && (
              <span className="text-app-green"> (with {formatCurrency(totalDeductions)} deductions)</span>
            )}
            {totalDeductions === 0 && (
              <span className="text-text-quaternary"> (without deductions)</span>
            )}
          </p>
        </div>
      </div>

      {/* Deduction Inputs */}
      <div className="rounded-xl border border-border bg-white/[0.02] p-4">
        <button
          type="button"
          onClick={() => setShowDeductions(!showDeductions)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-white transition-colors w-full"
        >
          {showDeductions ? <ChevronLeft className="w-4 h-4 rotate-[-90deg]" /> : <ChevronRight className="w-4 h-4" />}
          Enter your deductions to compare accurately
          {totalDeductions > 0 && (
            <span className="ml-auto text-xs text-app-green font-semibold">Total: {formatCurrency(totalDeductions)}</span>
          )}
        </button>

        {showDeductions && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <DeductionInput label="Sec 80C" sublabel="PPF, ELSS, LIC (max 1.5L)" value={sec80C} max={150000} onChange={setSec80C} />
            <DeductionInput label="Sec 80D" sublabel="Health Insurance (max 75K)" value={sec80D} max={75000} onChange={setSec80D} />
            <DeductionInput label="HRA" sublabel="House Rent Allowance" value={hra} max={500000} onChange={setHra} />
            <DeductionInput label="Sec 24(b)" sublabel="Home Loan Interest (max 2L)" value={sec24b} max={200000} onChange={setSec24b} />
          </div>
        )}
      </div>

      {/* Verdict */}
      <div className="p-4 rounded-xl bg-app-purple/5 border border-app-purple/20">
        <p className="text-sm">
          <span className="font-semibold text-app-purple">{betterRegime}</span>
          {' saves you '}
          <span className="font-semibold text-app-green">{formatCurrency(diff)}</span>
          {' more'}
          {newIsBetter && totalDeductions === 0 ? ' (without any deductions).' : '.'}
        </p>

        <RegimeVerdictDetail
          newIsBetter={newIsBetter}
          totalDeductions={totalDeductions}
          breakEvenDeduction={breakEvenDeduction}
          grossIncome={grossIncome}
        />
      </div>
    </div>
  )
}

/** Deduction input field for the regime comparison calculator */
function DeductionInput({ label, sublabel, value, max, onChange }: Readonly<{
  label: string
  sublabel: string
  value: number
  max: number
  onChange: (v: number) => void
}>) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <input
        type="number"
        min={0}
        max={max}
        value={value || ''}
        onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        placeholder="0"
        className="w-full px-3 py-1.5 text-sm bg-white/5 border border-border rounded-lg text-foreground placeholder:text-text-quaternary focus:outline-none focus:ring-1 focus:ring-app-blue/50"
      />
      <span className="text-caption text-text-quaternary mt-0.5 block">{sublabel}</span>
    </div>
  )
}

/** Multi-year salary projection comparison table */
function MultiYearProjectionTable({ projections }: Readonly<{ projections: ProjectedFYBreakdown[] }>) {
  const rows: Array<{ label: string; key: keyof ProjectedFYBreakdown; colorClass: string }> = [
    { label: 'Base Salary', key: 'baseSalary', colorClass: 'text-income' },
    { label: 'Bonus', key: 'bonus', colorClass: 'text-income' },
    { label: 'RSU Vesting', key: 'rsuIncome', colorClass: 'text-income' },
    { label: 'EPF', key: 'epf', colorClass: 'text-muted-foreground' },
    { label: 'Other', key: 'otherTaxable', colorClass: 'text-muted-foreground' },
    { label: 'Gross Taxable', key: 'grossTaxable', colorClass: 'text-foreground' },
    { label: 'Total Tax', key: 'totalTax', colorClass: 'text-expense' },
    { label: 'Take-Home', key: 'takeHome', colorClass: 'text-income' },
  ]

  return (
    <div className="glass rounded-2xl border border-border p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-app-purple/20 rounded-xl">
          <TrendingUp className="w-5 h-5 text-app-purple" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Multi-Year Projection</h3>
          <p className="text-xs text-muted-foreground">
            {projections.length} year outlook based on salary structure and growth assumptions
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Component</th>
              {projections.map((p) => (
                <th key={p.fy} className="text-right py-2 px-3 text-muted-foreground font-medium whitespace-nowrap">
                  FY {p.fy}
                  {p.isProjected && <span className="text-caption text-text-quaternary ml-1">*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasAnyValue = projections.some((p) => (p[row.key] as number) > 0)
              if (!hasAnyValue) return null
              return (
                <tr key={row.key} className="border-b border-border/50">
                  <td className="py-2.5 px-3 font-medium text-foreground">{row.label}</td>
                  {projections.map((p) => (
                    <td key={p.fy} className={`py-2.5 px-3 text-right ${row.colorClass}`}>
                      {formatCurrency(p[row.key] as number)}
                    </td>
                  ))}
                </tr>
              )
            })}
            {/* Effective Tax Rate row */}
            <tr className="border-b border-border/50">
              <td className="py-2.5 px-3 font-medium text-foreground">Effective Tax Rate</td>
              {projections.map((p) => (
                <td key={p.fy} className="py-2.5 px-3 text-right text-muted-foreground">
                  {p.effectiveTaxRate.toFixed(1)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-tertiary mt-3">
        * Projected values based on growth assumptions. Actual figures may vary.
      </p>
    </div>
  )
}
