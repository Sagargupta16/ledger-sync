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
import { computeAdvanceTaxSchedule, formatDueDate } from '@/lib/advanceTaxCalculator'
import type { TaxSlab, SlabBreakdownEntry } from '@/lib/taxCalculator'
import type { Transaction } from '@/types'
import { PageHeader, ChartContainer, chartTooltipProps, GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate, BAR_RADIUS, ACTIVE_DOT } from '@/components/ui'
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { rawColors } from '@/constants/colors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import TaxSummaryCards from '@/components/analytics/TaxSummaryCards'
import TaxSlabBreakdown from '@/components/analytics/TaxSlabBreakdown'
import TaxSummaryGrid from '@/components/analytics/TaxSummaryGrid'
import EffectiveTaxRateChart from '@/components/analytics/EffectiveTaxRateChart'
import TaxableIncomeTable from '@/components/analytics/TaxableIncomeTable'

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

interface ProjectionResult {
  grossTaxableIncome: number
  taxAlreadyPaid: number
  baseTax: number
  cess: number
  professionalTax: number
  slabBreakdown: SlabBreakdownEntry[]
  remainingMonths: number
  avgMonthlySalary: number
  projectedAdditionalIncome: number
}

/** Calculate year-end projection for the current FY */
function calculateProjection(
  currentFYData: FYData | null,
  netTaxableIncome: number,
  salaryMonthsCount: number,
  taxSlabs: TaxSlab[],
  standardDeduction: number,
  isNewRegime: boolean = true,
  fyYear: number = 2025,
): ProjectionResult {
  const today = new Date()
  const currentMonth = today.getMonth()
  const remainingMonths = currentMonth >= 3 ? 12 - (currentMonth - 3) : 3 - currentMonth

  const salaryStipendTxs = currentFYData?.incomeGroups?.['Salary & Stipend']?.transactions || []

  if (salaryStipendTxs.length === 0 || remainingMonths <= 0) {
    return {
      grossTaxableIncome: 0,
      taxAlreadyPaid: 0,
      baseTax: 0,
      cess: 0,
      professionalTax: 0,
      slabBreakdown: [],
      remainingMonths,
      avgMonthlySalary: 0,
      projectedAdditionalIncome: 0,
    }
  }

  const sorted = [...salaryStipendTxs].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  const recentSalaries = sorted.slice(0, Math.min(3, sorted.length))
  const totalRecentSalary = recentSalaries.reduce((sum, tx) => sum + tx.amount, 0)
  const avgMonthlySalary = totalRecentSalary / recentSalaries.length

  const projectedAdditionalIncome = avgMonthlySalary * remainingMonths
  const projectedNetTotal = netTaxableIncome + projectedAdditionalIncome
  const projectedSalaryMonthsCount = salaryMonthsCount + remainingMonths

  // Always use New Regime slabs for gross calculation (employer deducts TDS under new regime)
  const newSlabs = getNewRegimeSlabs(fyYear)
  const grossTaxableIncome = calculateGrossFromNet(projectedNetTotal, {
    slabs: newSlabs,
    standardDeduction,
    applyProfessionalTax: true,
    salaryMonthsCount: projectedSalaryMonthsCount,
    isNewRegime: true,
    fyStartYear: fyYear,
  })
  // Calculate tax using the SELECTED regime's slabs
  const projectedCalc = calculateTax(
    grossTaxableIncome,
    taxSlabs,
    standardDeduction,
    true,
    projectedSalaryMonthsCount,
    isNewRegime,
    fyYear,
  )

  return {
    grossTaxableIncome,
    taxAlreadyPaid: projectedCalc.totalTax,
    baseTax: projectedCalc.tax,
    cess: projectedCalc.cess,
    professionalTax: projectedCalc.professionalTax,
    slabBreakdown: projectedCalc.slabBreakdown,
    remainingMonths,
    avgMonthlySalary,
    projectedAdditionalIncome,
  }
}

/** Resolve actual vs projected display values */
function resolveDisplayValues(
  projection: ProjectionResult | null,
  actual: {
    grossTaxableIncome: number
    netTaxableIncome: number
    taxAlreadyPaid: number
    baseTax: number
    cess: number
    professionalTax: number
    slabBreakdown: SlabBreakdownEntry[]
    income: number
  },
) {
  if (!projection) {
    return {
      gross: actual.grossTaxableIncome,
      net: actual.netTaxableIncome,
      totalTax: actual.taxAlreadyPaid,
      baseTax: actual.baseTax,
      cess: actual.cess,
      professionalTax: actual.professionalTax,
      slabBreakdown: actual.slabBreakdown,
      income: actual.income,
    }
  }
  return {
    gross: projection.grossTaxableIncome,
    net: actual.netTaxableIncome + projection.projectedAdditionalIncome,
    totalTax: projection.taxAlreadyPaid,
    baseTax: projection.baseTax,
    cess: projection.cess,
    professionalTax: projection.professionalTax,
    slabBreakdown: projection.slabBreakdown,
    income: actual.income + projection.projectedAdditionalIncome,
  }
}

/** Determine the selected tax regime based on FY availability and user preference */
function resolveSelectedRegime(
  newRegimeAvailable: boolean,
  regimeOverride: 'new' | 'old' | null,
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
  regimeOverride: 'new' | 'old' | null,
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

interface ProjectionAndDisplayInput {
  showProjection: boolean
  selectedFY: string
  fiscalYearStartMonth: number
  hasEmploymentIncome: boolean
  currentFYData: FYData | null
  netTaxableIncome: number
  salaryMonthsCount: number
  taxSlabs: TaxSlab[]
  standardDeduction: number
  isNewRegime: boolean
  fyYear: number
  actual: {
    grossTaxableIncome: number
    taxAlreadyPaid: number
    baseTax: number
    cess: number
    professionalTax: number
    slabBreakdown: SlabBreakdownEntry[]
    income: number
  }
}

/** Compute projection and resolve display values for actual vs projected */
function computeProjectionAndDisplay(input: ProjectionAndDisplayInput) {
  const { showProjection, selectedFY, fiscalYearStartMonth, hasEmploymentIncome,
    currentFYData, netTaxableIncome, salaryMonthsCount, taxSlabs,
    standardDeduction, isNewRegime, fyYear, actual } = input

  const currentFYLabel = getFYFromDate(
    new Date().toISOString().split('T')[0],
    fiscalYearStartMonth,
  )
  const isCurrentFY = selectedFY === currentFYLabel
  const useProjected = showProjection && isCurrentFY && hasEmploymentIncome

  const projection = useProjected
    ? calculateProjection(currentFYData, netTaxableIncome, salaryMonthsCount, taxSlabs, standardDeduction, isNewRegime, fyYear)
    : null

  const remainingMonths = projection?.remainingMonths ?? 0
  const avgMonthlySalary = projection?.avgMonthlySalary ?? 0

  const projectedTaxResult = useProjected && projection
    ? calculateTax(projection.grossTaxableIncome, taxSlabs, standardDeduction, true, salaryMonthsCount + remainingMonths, isNewRegime, fyYear)
    : null

  const displayValues = resolveDisplayValues(projection, {
    ...actual,
    netTaxableIncome,
  })

  return { isCurrentFY, projection, projectedTaxResult, remainingMonths, avgMonthlySalary, displayValues }
}

/** Tax regime toggle, year-end projection toggle, and FY navigation action bar */
function TaxPageActions({
  isNewRegime,
  setRegimeOverride,
  newRegimeAvailable,
  isCurrentFY,
  hasEmploymentIncome,
  showProjection,
  setShowProjection,
  remainingMonths,
  avgMonthlySalary,
  selectedFY,
  canGoBack,
  canGoForward,
  goToPreviousFY,
  goToNextFY,
}: Readonly<{
  isNewRegime: boolean
  setRegimeOverride: (regime: 'new' | 'old') => void
  newRegimeAvailable: boolean
  isCurrentFY: boolean
  hasEmploymentIncome: boolean
  showProjection: boolean
  setShowProjection: (show: boolean) => void
  remainingMonths: number
  avgMonthlySalary: number
  selectedFY: string
  canGoBack: boolean
  canGoForward: boolean
  goToPreviousFY: () => void
  goToNextFY: () => void
}>) {
  return (
    <div className="flex items-center gap-4">
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

      {/* Year-End Projection Toggle — LEFT */}
      {isCurrentFY && hasEmploymentIncome && (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setShowProjection(!showProjection)}
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              showProjection
                ? 'bg-primary text-white shadow-lg shadow-primary/50'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
            }`}
          >
            {showProjection ? 'Showing Projection' : 'Year-End Projection'}
          </button>
          {showProjection && remainingMonths > 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              +{remainingMonths} mo @ {formatCurrency(avgMonthlySalary)}/mo
            </span>
          )}
        </div>
      )}

      {/* FY Navigation — RIGHT */}
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

  // Tax regime preference: default from user preferences, overridable via toggle
  const preferredRegime = preferences?.preferred_tax_regime || 'new'
  const [regimeOverride, setRegimeOverride] = useState<'new' | 'old' | null>(null)

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
  const transactionsByFY = useMemo(() => {
    const grouped: Record<string, FYData> = {}

    for (const tx of allTransactions) {
      const fy = getFYFromDate(tx.date, fiscalYearStartMonth)
      if (!grouped[fy]) {
        grouped[fy] = createEmptyFYData()
      }
      grouped[fy].transactions.push(tx)

      if (tx.type === 'Income') {
        grouped[fy].income += tx.amount
        classifyAndAccumulateIncome(tx, grouped[fy], incomeClassification)
      } else if (tx.type === 'Expense') {
        grouped[fy].expense += tx.amount
      }
    }

    return grouped
  }, [allTransactions, fiscalYearStartMonth, incomeClassification])

  // Get sorted FY list
  const fyList = useMemo(() => {
    return Object.keys(transactionsByFY)
      .sort((a, b) => a.localeCompare(b))
      .reverse()
  }, [transactionsByFY])

  // Use first FY as default when none is explicitly selected
  const effectiveFY = selectedFY || fyList[0] || ''

  // ── Derived values for selected FY ──────────────────────────────────

  const currentFYData = effectiveFY ? transactionsByFY[effectiveFY] : null
  const income = currentFYData?.income || 0
  const expense = currentFYData?.expense || 0
  const netTaxableIncome = currentFYData?.taxableIncome || 0
  const salaryMonthsCount = currentFYData?.salaryMonths?.size || 0

  // ── Tax computation for selected FY ─────────────────────────────────

  const {
    fyYear, newRegimeAvailable, isNewRegime, taxSlabs, regimeLabel,
    standardDeduction, hasEmploymentIncome, grossTaxableIncome,
    baseTax, slabBreakdown, rebate87A, surcharge, cess,
    professionalTax, taxAlreadyPaid,
  } = computeTaxForFY(effectiveFY, netTaxableIncome, salaryMonthsCount, regimeOverride, preferredRegime)

  // ── Projection + display values ────────────────────────────────────

  const {
    isCurrentFY, projectedTaxResult, remainingMonths, avgMonthlySalary, displayValues,
  } = computeProjectionAndDisplay({
    showProjection, selectedFY: effectiveFY, fiscalYearStartMonth,
    hasEmploymentIncome, currentFYData, netTaxableIncome,
    salaryMonthsCount, taxSlabs, standardDeduction, isNewRegime, fyYear,
    actual: { grossTaxableIncome, taxAlreadyPaid, baseTax, cess, professionalTax, slabBreakdown, income },
  })

  const displayGross = displayValues.gross
  const displayNet = displayValues.net
  const displayTotalTax = displayValues.totalTax
  const displayBaseTax = displayValues.baseTax
  const displayCess = displayValues.cess
  const displayProfessionalTax = displayValues.professionalTax
  const displaySlabBreakdown = displayValues.slabBreakdown
  const displayIncome = displayValues.income

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
      <motion.div
        className="max-w-7xl mx-auto space-y-4 md:space-y-6"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.div variants={fadeUpItem}>
          <PageHeader
            title="Tax Planning"
            subtitle={`Estimate your tax liability — ${regimeLabel}`}
            action={
              <TaxPageActions
                isNewRegime={isNewRegime}
                setRegimeOverride={setRegimeOverride}
                newRegimeAvailable={newRegimeAvailable}
                isCurrentFY={isCurrentFY}
                hasEmploymentIncome={hasEmploymentIncome}
                showProjection={showProjection}
                setShowProjection={setShowProjection}
                remainingMonths={remainingMonths}
                avgMonthlySalary={avgMonthlySalary}
                selectedFY={effectiveFY}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                goToPreviousFY={goToPreviousFY}
                goToNextFY={goToNextFY}
              />
            }
          />
        </motion.div>

        {fyList.length === 0 && !isLoading ? (
          <motion.div variants={fadeUpItem}>
            <ChartEmptyState height={300} message="No transaction data available. Upload your data to see tax estimates." />
          </motion.div>
        ) : (
        <>
        <motion.div variants={fadeUpItem}>
          <TaxSummaryCards
            isLoading={isLoading}
            netTaxableIncome={displayNet}
            grossTaxableIncome={displayGross}
            taxAlreadyPaid={displayTotalTax}
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TaxSlabBreakdown
            isNewRegime={isNewRegime}
            taxSlabs={taxSlabs}
            slabBreakdown={displaySlabBreakdown}
            grossTaxableIncome={displayGross}
            standardDeduction={standardDeduction}
            fyYear={fyYear}
            baseTax={displayBaseTax}
            rebate87A={projectedTaxResult?.rebate87A ?? rebate87A}
            surcharge={projectedTaxResult?.surcharge ?? surcharge}
            cess={displayCess}
            professionalTax={displayProfessionalTax}
            totalTax={displayTotalTax}
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TaxSummaryGrid
            selectedFY={effectiveFY}
            grossTaxableIncome={displayGross}
            taxAlreadyPaid={displayTotalTax}
            netTaxableIncome={displayNet}
            totalIncome={displayIncome}
            totalExpense={expense}
          />
        </motion.div>

        {/* Advance Tax Schedule */}
        {isCurrentFY && displayTotalTax > 10000 && (
          <motion.div variants={fadeUpItem}>
            <AdvanceTaxScheduleSection totalTax={displayTotalTax} />
          </motion.div>
        )}

        {/* Effective Tax Rate Curve */}
        <EffectiveTaxRateChart
          taxSlabs={taxSlabs}
          isNewRegime={isNewRegime}
          fyYear={fyYear}
          standardDeduction={standardDeduction}
          currentIncome={grossTaxableIncome}
        />

        <motion.div variants={fadeUpItem}>
          <TaxableIncomeTable
            selectedFY={effectiveFY}
            incomeGroups={currentFYData?.incomeGroups}
            netTaxableIncome={netTaxableIncome}
          />
        </motion.div>

        {/* ── Tax Saving Suggestions ─────────────────────────────── */}
        <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-4 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-ios-green/20 rounded-xl">
              <TrendingUp className="w-5 h-5 text-ios-green" />
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
                <h3 className="text-lg font-semibold">Tax Paid Per Year</h3>
                <p className="text-xs text-muted-foreground">Annual tax with cumulative trend</p>
              </div>
            </div>
            {(() => {
              const yearlyTaxData = fyList.slice().reverse().map(fy => {
                const data = transactionsByFY[fy]
                if (!data) return { fy, tax: 0, income: 0, cumulative: 0 }
                // Use taxableIncome if classified, otherwise fall back to total income
                const taxableAmt = (data.taxableIncome > 0) ? data.taxableIncome : data.income
                const salaryMonths = data.salaryMonths?.size || 0
                const computed = computeTaxForFY(fy, taxableAmt, salaryMonths, regimeOverride, preferredRegime)
                return { fy, tax: Math.round(computed.taxAlreadyPaid), income: Math.round(computed.grossTaxableIncome), cumulative: 0 }
              })
              let cum = 0
              for (const d of yearlyTaxData) { cum += d.tax; d.cumulative = cum }
              if (yearlyTaxData.every(d => d.tax === 0 && d.income === 0)) return <ChartEmptyState height={280} message="No tax liability found across years" />
              return (
                <ChartContainer height={300}>
                  <BarChart data={yearlyTaxData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                    <CartesianGrid {...GRID_DEFAULTS} />
                    <XAxis {...xAxisDefaults(yearlyTaxData.length)} dataKey="fy" />
                    <YAxis {...yAxisDefaults()} />
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number | undefined, name: string | undefined) => {
                        if (value === undefined) return ['', '']
                        const labels: Record<string, string> = { tax: 'Tax Paid', cumulative: 'Cumulative', income: 'Income' }
                        return [formatCurrency(value), labels[name ?? ''] ?? name]
                      }}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="tax" name="tax" fill={rawColors.ios.red} fillOpacity={0.7} radius={BAR_RADIUS} maxBarSize={40}
                      isAnimationActive={shouldAnimate(yearlyTaxData.length)} animationDuration={600} animationEasing="ease-out"
                    />
                    <Line type="monotone" dataKey="cumulative" name="cumulative" stroke={rawColors.ios.blue} strokeWidth={2} strokeDasharray="6 3"
                      dot={false} activeDot={{ ...ACTIVE_DOT, fill: rawColors.ios.blue }}
                      isAnimationActive={shouldAnimate(yearlyTaxData.length)} animationDuration={800}
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
            <div className="p-2.5 bg-ios-purple/20 rounded-xl">
              <ChevronRight className="w-5 h-5 text-ios-purple" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Which Regime Saves You More?</h3>
              <p className="text-xs text-muted-foreground">
                Based on your income of {formatCurrency(grossTaxableIncome)}
              </p>
            </div>
          </div>

          <RegimeComparison
            grossIncome={grossTaxableIncome}
            fyYear={fyYear}
            standardDeduction={standardDeduction}
            salaryMonthsCount={salaryMonthsCount}
          />
        </motion.div>
        )}
        </>
        )}
      </motion.div>
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
          <span className="text-xs font-semibold text-ios-green">
            up to {formatCurrency(amount)}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

/** Advance tax quarterly schedule section */
function getQuarterStatusClass(status: string, isNext: boolean): string {
  if (status === 'overdue') return 'bg-ios-red/20 text-ios-red'
  if (isNext) return 'bg-ios-orange/20 text-ios-orange'
  return 'bg-white/5 text-muted-foreground'
}

function AdvanceTaxScheduleSection({ totalTax }: Readonly<{ totalTax: number }>) {
  const schedule = useMemo(() => computeAdvanceTaxSchedule(totalTax, 0), [totalTax])

  return (
    <div className="glass rounded-2xl border border-border p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-ios-orange/20 rounded-xl">
          <ChevronRight className="w-5 h-5 text-ios-orange" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Advance Tax Schedule</h3>
          <p className="text-xs text-muted-foreground">
            Quarterly installments -- Total advance tax: {formatCurrency(schedule.advanceTaxDue)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Quarter</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Due Date</th>
              <th className="text-right py-2 px-3 text-muted-foreground font-medium">This Quarter</th>
              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Cumulative</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {schedule.quarters.map((q) => {
              const isNext = schedule.nextDueQuarter?.quarter === q.quarter
              return (
                <tr
                  key={q.quarter}
                  className={`border-b border-border/50 ${isNext ? 'bg-ios-orange/[0.06]' : ''}`}
                >
                  <td className="py-2.5 px-3 font-medium">
                    {q.quarter} ({q.cumulativePercent}%)
                    {isNext && <span className="ml-1.5 text-xs text-ios-orange font-semibold">NEXT</span>}
                  </td>
                  <td className="py-2.5 px-3">{formatDueDate(q.dueDate)}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(q.quarterAmount)}</td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">{formatCurrency(q.cumulativeAmount)}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getQuarterStatusClass(q.status, isNext)}`}>
                      {q.status === 'overdue' ? 'Overdue' : 'Upcoming'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-tertiary mt-3">
        Advance tax applies if total tax liability exceeds Rs 10,000. Interest under Sec 234B/234C applies for late/short payment.
      </p>
    </div>
  )
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
  // Apply user deductions to old regime income
  const oldRegimeIncome = Math.max(0, grossIncome - totalDeductions)
  const oldTax = calculateTax(oldRegimeIncome, getTaxSlabs(fyYear, 'old'), standardDeduction, true, salaryMonthsCount, false, fyYear)

  const newTotal = newTax.totalTax
  const oldTotal = oldTax.totalTax
  const diff = Math.abs(newTotal - oldTotal)
  const newIsBetter = newTotal <= oldTotal
  const oldIsBetter = !newIsBetter
  const betterRegime = newIsBetter ? 'New Regime' : 'Old Regime'

  // Calculate how much deduction needed in Old Regime to beat New Regime
  let breakEvenDeduction = 0
  if (newIsBetter && grossIncome > 0) {
    for (let d = 0; d <= 1000000; d += 10000) {
      const oldWithDeductions = calculateTax(
        Math.max(0, grossIncome - d), getTaxSlabs(fyYear, 'old'),
        standardDeduction, true, salaryMonthsCount, false, fyYear,
      )
      if (oldWithDeductions.totalTax <= newTotal) {
        breakEvenDeduction = d
        break
      }
    }
  }

  if (grossIncome <= 0) return null

  return (
    <div className="space-y-4">
      {/* Side by side comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`p-4 rounded-xl border ${newIsBetter ? 'border-ios-green/30 bg-ios-green/5' : 'border-border bg-white/5'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">New Regime</span>
            {newIsBetter && <span className="text-caption font-semibold text-ios-green px-2 py-0.5 rounded-full bg-ios-green/20">Better</span>}
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(newTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {grossIncome > 0 ? ((newTotal / grossIncome) * 100).toFixed(1) : '0'}%
          </p>
        </div>
        <div className={`p-4 rounded-xl border ${oldIsBetter ? 'border-ios-green/30 bg-ios-green/5' : 'border-border bg-white/5'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Old Regime</span>
            {oldIsBetter && <span className="text-caption font-semibold text-ios-green px-2 py-0.5 rounded-full bg-ios-green/20">Better</span>}
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(oldTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {grossIncome > 0 ? ((oldTotal / grossIncome) * 100).toFixed(1) : '0'}%
            {totalDeductions > 0 && (
              <span className="text-ios-green"> (with {formatCurrency(totalDeductions)} deductions)</span>
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
            <span className="ml-auto text-xs text-ios-green font-semibold">Total: {formatCurrency(totalDeductions)}</span>
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
      <div className="p-4 rounded-xl bg-ios-purple/5 border border-ios-purple/20">
        <p className="text-sm">
          <span className="font-semibold text-ios-purple">{betterRegime}</span>
          {' saves you '}
          <span className="font-semibold text-ios-green">{formatCurrency(diff)}</span>
          {' more'}
          {newIsBetter && totalDeductions === 0 ? ' (without any deductions).' : '.'}
        </p>

        {newIsBetter && totalDeductions === 0 && breakEvenDeduction > 0 && (
          <p className="text-sm mt-2 text-muted-foreground">
            Old Regime becomes better only if you claim at least{' '}
            <span className="font-semibold text-foreground">{formatCurrency(breakEvenDeduction)}</span>
            {' '}in deductions (80C + 80D + HRA + 24b etc). Enter your deductions above to check.
          </p>
        )}

        {newIsBetter && breakEvenDeduction === 0 && grossIncome > 500000 && (
          <p className="text-sm mt-2 text-muted-foreground">
            At your income level, New Regime is better even with maximum Old Regime deductions.
          </p>
        )}

        {newIsBetter && totalDeductions > 0 && (
          <p className="text-sm mt-2 text-muted-foreground">
            Even with {formatCurrency(totalDeductions)} in deductions, New Regime is cheaper. You need {formatCurrency(Math.max(0, breakEvenDeduction - totalDeductions))} more in deductions for Old Regime to win.
          </p>
        )}

        {oldIsBetter && (
          <p className="text-sm mt-2 text-muted-foreground">
            {totalDeductions > 0
              ? `With ${formatCurrency(totalDeductions)} in deductions, Old Regime saves you more. Make sure to claim all these deductions when filing.`
              : "The Old Regime's higher slab rates are offset by deductions available. Enter your deductions above to see exact savings."}
          </p>
        )}
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
        className="w-full px-3 py-1.5 text-sm bg-white/5 border border-border rounded-lg text-foreground placeholder:text-text-quaternary focus:outline-none focus:ring-1 focus:ring-ios-blue/50"
      />
      <span className="text-caption text-text-quaternary mt-0.5 block">{sublabel}</span>
    </div>
  )
}
